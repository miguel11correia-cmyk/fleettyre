// ── CLIENTE IMAP MÍNIMO ──────────────────────────────────────────────
// Não existe uma biblioteca IMAP fiável para o runtime Deno das Edge
// Functions, por isso isto implementa só o suficiente do protocolo
// IMAP4rev1 (RFC 3501) para o que precisamos: ligar por TLS implícito
// (porta 993, o mais comum em alojamento de email), autenticar,
// procurar mensagens recentes, e ler cabeçalhos/anexos específicos.
// Não é uma biblioteca genérica — assume um pedido de cada vez, sem
// pipelining, o que é suficiente para uma sincronização periódica.

function indexOfCRLF(buf: Uint8Array, desde = 0): number {
  for (let i = desde; i < buf.length - 1; i++) {
    if (buf[i] === 13 && buf[i + 1] === 10) return i;
  }
  return -1;
}

class LeitorBytes {
  #conn: Deno.TlsConn;
  #buffer: Uint8Array = new Uint8Array(0);

  constructor(conn: Deno.TlsConn) {
    this.#conn = conn;
  }

  async #encherBuffer(): Promise<boolean> {
    const chunk = new Uint8Array(8192);
    const n = await this.#conn.read(chunk);
    if (n === null) return false;
    const novo = new Uint8Array(this.#buffer.length + n);
    novo.set(this.#buffer);
    novo.set(chunk.subarray(0, n), this.#buffer.length);
    this.#buffer = novo;
    return true;
  }

  async lerLinha(): Promise<Uint8Array> {
    while (true) {
      const idx = indexOfCRLF(this.#buffer);
      if (idx !== -1) {
        const linha = this.#buffer.slice(0, idx);
        this.#buffer = this.#buffer.slice(idx + 2);
        return linha;
      }
      if (!(await this.#encherBuffer())) throw new Error("Ligação IMAP fechada inesperadamente.");
    }
  }

  async lerBytes(n: number): Promise<Uint8Array> {
    while (this.#buffer.length < n) {
      if (!(await this.#encherBuffer())) throw new Error("Ligação IMAP fechada inesperadamente.");
    }
    const dados = this.#buffer.slice(0, n);
    this.#buffer = this.#buffer.slice(n);
    return dados;
  }

  async escrever(texto: string) {
    await this.#conn.write(new TextEncoder().encode(texto));
  }
}

export interface RespostaIMAP {
  ok: boolean;
  linhas: string[];
  literais: Uint8Array[];
}

export class ClienteIMAP {
  #leitor: LeitorBytes;
  #contadorTag = 0;
  #decoder = new TextDecoder("utf-8", { fatal: false });

  private constructor(leitor: LeitorBytes) {
    this.#leitor = leitor;
  }

  static async ligar(host: string, port: number): Promise<ClienteIMAP> {
    const conn = await Deno.connectTls({ hostname: host, port });
    const leitor = new LeitorBytes(conn);
    await leitor.lerLinha(); // saudação inicial do servidor, ignorada
    return new ClienteIMAP(leitor);
  }

  #proximaTag(): string {
    this.#contadorTag++;
    return `A${this.#contadorTag}`;
  }

  async #executar(comando: string): Promise<RespostaIMAP> {
    const tag = this.#proximaTag();
    await this.#leitor.escrever(`${tag} ${comando}\r\n`);

    const linhas: string[] = [];
    const literais: Uint8Array[] = [];

    while (true) {
      const linhaBytes = await this.#leitor.lerLinha();
      const linhaTexto = this.#decoder.decode(linhaBytes);

      const literal = /\{(\d+)\+?\}\s*$/.exec(linhaTexto);
      if (literal) {
        const n = parseInt(literal[1], 10);
        literais.push(await this.#leitor.lerBytes(n));
        linhas.push(linhaTexto);
        continue; // o resto desta linha lógica (ex: ")") vem na próxima leitura
      }

      linhas.push(linhaTexto);

      if (linhaTexto.startsWith(tag + " ")) {
        return { ok: linhaTexto.startsWith(tag + " OK"), linhas, literais };
      }
    }
  }

  // Escapa aspas e barras invertidas — suficiente para utilizador/password
  // normais; não cobre todos os casos exóticos de IMAP quoted-strings.
  #aspas(valor: string): string {
    return `"${valor.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }

  async login(utilizador: string, password: string): Promise<void> {
    const resp = await this.#executar(`LOGIN ${this.#aspas(utilizador)} ${this.#aspas(password)}`);
    if (!resp.ok) throw new Error(`Login IMAP falhou: ${resp.linhas.join(" ")}`);
  }

  async selecionarInbox(): Promise<void> {
    const resp = await this.#executar(`SELECT INBOX`);
    if (!resp.ok) throw new Error(`SELECT INBOX falhou: ${resp.linhas.join(" ")}`);
  }

  // Formato de data exigido pelo IMAP SEARCH: "01-Jan-2026" — só granularidade
  // de dia, mais grosseiro que o filtro do Graph, mas o dedup por Message-ID
  // evita duplicados nas sincronizações seguintes.
  async pesquisarDesde(desde: Date): Promise<string[]> {
    const meses = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const dataImap = `${String(desde.getUTCDate()).padStart(2, "0")}-${meses[desde.getUTCMonth()]}-${desde.getUTCFullYear()}`;
    const resp = await this.#executar(`UID SEARCH SINCE ${dataImap}`);
    if (!resp.ok) throw new Error(`SEARCH falhou: ${resp.linhas.join(" ")}`);

    const linhaResultado = resp.linhas.find(l => l.startsWith("* SEARCH"));
    if (!linhaResultado) return [];
    return linhaResultado.replace("* SEARCH", "").trim().split(/\s+/).filter(Boolean);
  }

  // Campos de cabeçalho só (leve) — para decidir se vale a pena descarregar
  // a mensagem inteira.
  async obterCabecalhos(uid: string): Promise<string> {
    const resp = await this.#executar(`UID FETCH ${uid} (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID)])`);
    if (!resp.ok || resp.literais.length === 0) return "";
    return this.#decoder.decode(resp.literais[0]);
  }

  // Mensagem completa em bruto (cabeçalhos + corpo) — só para as que já
  // passaram o filtro de cabeçalhos, evita descarregar tudo à toa.
  async obterMensagemCompleta(uid: string): Promise<Uint8Array> {
    const resp = await this.#executar(`UID FETCH ${uid} (BODY.PEEK[])`);
    if (!resp.ok || resp.literais.length === 0) throw new Error("Não foi possível obter a mensagem completa.");
    return resp.literais[0];
  }

  async fechar(): Promise<void> {
    try { await this.#executar("LOGOUT"); } catch { /* já não importa */ }
  }
}
