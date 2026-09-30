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

function extrairDataInterna(texto: string): Date | null {
  // INTERNALDATE "05-Jan-2026 12:34:56 +0000"
  const m = /INTERNALDATE "(\d{2})-(\w{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})"/.exec(texto);
  if (!m) return null;
  const meses: Record<string, number> = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
  const [, dia, mes, ano, hora, min, seg, fuso] = m;
  const sinal = fuso[0] === "-" ? -1 : 1;
  const fusoMin = sinal * (parseInt(fuso.slice(1, 3), 10) * 60 + parseInt(fuso.slice(3, 5), 10));
  const utc = Date.UTC(parseInt(ano, 10), meses[mes], parseInt(dia, 10), parseInt(hora, 10), parseInt(min, 10), parseInt(seg, 10));
  return new Date(utc - fusoMin * 60000);
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

  // Mensagem completa em bruto (cabeçalhos + corpo).
  async obterMensagemCompleta(uid: string): Promise<Uint8Array> {
    const resp = await this.#executar(`UID FETCH ${uid} (BODY.PEEK[])`);
    if (!resp.ok || resp.literais.length === 0) throw new Error("Não foi possível obter a mensagem completa.");
    return resp.literais[0];
  }

  // Verificação barata em LOTE — só a estrutura MIME (tipos/nomes de cada
  // parte) e a data de cada mensagem, sem descarregar conteúdo nenhum, e
  // num único pedido à rede para todo o lote (este cliente não faz
  // pipelining — um pedido por mensagem seria demasiados round-trips
  // sequenciais para uma caixa com centenas/milhares de mensagens numa
  // janela). Usada para descartar mensagens sem PDF anexado antes de
  // gastar tempo de CPU a descarregar e analisar a mensagem completa (a
  // condição já é obrigatória no filtro a jusante, por isso isto não
  // deixa escapar nada — só evita trabalho a mais). A data de cada
  // mensagem serve para saber até onde a sincronização avançou, quando
  // um limite de segurança obriga a parar a meio de uma janela grande.
  async verificarMensagens(uids: string[]): Promise<Map<string, { temPdf: boolean; dataRecebido: Date | null }>> {
    const resultado = new Map<string, { temPdf: boolean; dataRecebido: Date | null }>();
    if (uids.length === 0) return resultado;

    const resp = await this.#executar(`UID FETCH ${uids.join(",")} (UID BODYSTRUCTURE INTERNALDATE)`);
    if (!resp.ok) return resultado;

    // Cada mensagem do lote começa numa linha "* N FETCH (...)" — agrupa
    // essa linha com as seguintes, até à próxima "* N FETCH" ou ao fim.
    let grupoAtual: string[] = [];
    const grupos: string[][] = [];
    for (const linha of resp.linhas) {
      if (/^\* \d+ FETCH/.test(linha)) {
        if (grupoAtual.length > 0) grupos.push(grupoAtual);
        grupoAtual = [linha];
      } else if (grupoAtual.length > 0) {
        grupoAtual.push(linha);
      }
    }
    if (grupoAtual.length > 0) grupos.push(grupoAtual);

    for (const grupo of grupos) {
      const texto = grupo.join(" ");
      const uidMatch = /UID (\d+)/.exec(texto);
      if (!uidMatch) continue;
      resultado.set(uidMatch[1], {
        temPdf: texto.toLowerCase().includes("pdf"),
        dataRecebido: extrairDataInterna(texto),
      });
    }

    return resultado;
  }

  async fechar(): Promise<void> {
    try { await this.#executar("LOGOUT"); } catch { /* já não importa */ }
  }
}
