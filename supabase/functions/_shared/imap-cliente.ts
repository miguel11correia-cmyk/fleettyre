// ── CLIENTE IMAP MÍNIMO ──────────────────────────────────────────────
// Não existe uma biblioteca IMAP fiável para o runtime Deno das Edge
// Functions, por isso isto implementa só o suficiente do protocolo
// IMAP4rev1 (RFC 3501) para o que precisamos: ligar por TLS implícito
// (porta 993, o mais comum em alojamento de email), autenticar,
// procurar mensagens recentes, e ler metadados/partes específicas.
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

// ── Parser mínimo de listas parentizadas (BODYSTRUCTURE/ENVELOPE) ────
// Ambas usam a mesma gramática: listas aninhadas entre parêntesis, com
// strings entre aspas, números nus, e NIL para ausência de valor. Não
// cobre literais dentro da própria estrutura (raro — só para campos
// muito compridos, ex. um assunto enorme); nesse caso o campo em causa
// fica vazio em vez de correcto, mas não faz o parser falhar.

type Token =
  | { t: "open" }
  | { t: "close" }
  | { t: "nil" }
  | { t: "atom"; v: string }
  | { t: "str"; v: string }
  | { t: "num"; v: number };

function tokenizar(texto: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = texto.length;
  while (i < n) {
    const c = texto[i];
    if (c === "(") { tokens.push({ t: "open" }); i++; continue; }
    if (c === ")") { tokens.push({ t: "close" }); i++; continue; }
    if (c === " " || c === "\t" || c === "\r" || c === "\n") { i++; continue; }
    if (c === '"') {
      let j = i + 1;
      let v = "";
      while (j < n && texto[j] !== '"') {
        if (texto[j] === "\\" && j + 1 < n) { v += texto[j + 1]; j += 2; }
        else { v += texto[j]; j++; }
      }
      tokens.push({ t: "str", v });
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < n && !/[\s()]/.test(texto[j])) j++;
    const atom = texto.slice(i, j);
    if (atom.length === 0) { i++; continue; }
    if (atom.toUpperCase() === "NIL") tokens.push({ t: "nil" });
    else if (/^\d+$/.test(atom)) tokens.push({ t: "num", v: parseInt(atom, 10) });
    else tokens.push({ t: "atom", v: atom });
    i = j;
  }
  return tokens;
}

// Devolve: lista aninhada (array), string, número, ou null (NIL) — a
// árvore genérica que representa qualquer valor IMAP parentizado.
function parsearValor(tokens: Token[], pos: { i: number }): any {
  const tok = tokens[pos.i];
  if (!tok) return null;
  if (tok.t === "open") {
    pos.i++;
    const itens: any[] = [];
    while (tokens[pos.i] && tokens[pos.i].t !== "close") {
      itens.push(parsearValor(tokens, pos));
    }
    pos.i++; // consome "close"
    return itens;
  }
  pos.i++;
  if (tok.t === "nil") return null;
  if (tok.t === "num") return tok.v;
  return tok.v; // atom ou str — ambos tratados como texto
}

function ehLista(x: any): x is any[] { return Array.isArray(x); }
function comoTexto(x: any): string { return typeof x === "string" ? x : ""; }

// ── BODYSTRUCTURE: partes-folha com endereçamento por número ─────────
// Parte não-multipart: [tipo, subtipo, params, id, descrição, codificação, tamanho, ...]
// Parte multipart: [subparte1, subparte2, ..., subtipo, ...]
// Numeração por RFC 3501: 1, 2, 3... no nível de topo; "2.1", "2.2" dentro
// da 2ª subparte se essa for também multipart, etc.

export interface ParteMime {
  numero: string;
  tipo: string;
  subtipo: string;
  nome: string;
  codificacao: string;
}

function extrairNomeDeParams(params: any): string {
  if (!ehLista(params)) return "";
  for (let i = 0; i + 1 < params.length; i += 2) {
    const chave = comoTexto(params[i]).toUpperCase();
    if (chave === "NAME" || chave === "FILENAME") return comoTexto(params[i + 1]);
  }
  return "";
}

// O nome de um anexo pode vir nos parâmetros do content-type (NAME) ou
// na content-disposition (FILENAME, numa posição de extensão que varia
// por servidor) — procura em qualquer lista aninhada depois do tamanho.
function procurarNomeEmExtensoes(itens: any[]): string {
  for (let k = 6; k < itens.length; k++) {
    const campo = itens[k];
    if (!ehLista(campo)) continue;
    const directo = extrairNomeDeParams(campo);
    if (directo) return directo;
    for (const sub of campo) {
      if (ehLista(sub)) {
        const indirecto = extrairNomeDeParams(sub);
        if (indirecto) return indirecto;
      }
    }
  }
  return "";
}

function extrairPartesFolha(itens: any, prefixo: string, resultado: ParteMime[]) {
  if (!ehLista(itens) || itens.length === 0) return;

  if (ehLista(itens[0])) {
    // Multipart — cada item que for lista é uma subparte, até ao
    // subtipo (string, ex: "MIXED") que fecha a lista de subpartes.
    let n = 1;
    for (const item of itens) {
      if (!ehLista(item)) break;
      extrairPartesFolha(item, prefixo ? `${prefixo}.${n}` : String(n), resultado);
      n++;
    }
    return;
  }

  const tipo = comoTexto(itens[0]).toLowerCase();
  const subtipo = comoTexto(itens[1]).toLowerCase();
  const params = itens[2];
  const codificacao = comoTexto(itens[5]) || "7BIT";
  const nome = extrairNomeDeParams(params) || procurarNomeEmExtensoes(itens);

  resultado.push({ numero: prefixo || "1", tipo, subtipo, nome, codificacao });
}

// ── ENVELOPE: assunto, remetente, Message-ID ──────────────────────────
// [data, assunto, from, sender, replyTo, to, cc, bcc, inReplyTo, messageId]
// Endereços: lista de [nomePessoal, rotaOrigem, mailbox, host]

function extrairEnderecoDeEnvelope(enderecos: any): string {
  if (!ehLista(enderecos) || enderecos.length === 0) return "";
  const primeiro = enderecos[0];
  if (!ehLista(primeiro)) return "";
  const mailbox = comoTexto(primeiro[2]);
  const host = comoTexto(primeiro[3]);
  if (!mailbox || !host) return "";
  return `${mailbox}@${host}`;
}

// Endereço em ENVELOPE: [nomePessoal, rotaOrigem, mailbox, host] — o
// nome de exibição ("Sobral Pneus", por ex.) vem em texto já
// descodificado de RFC 2047 pelo servidor em alguns casos, mas não
// sempre; descodificarTextoCabecalho (chamado por quem usa isto) trata
// disso, tal como já faz para o assunto.
function extrairNomeDeEnvelope(enderecos: any): string {
  if (!ehLista(enderecos) || enderecos.length === 0) return "";
  const primeiro = enderecos[0];
  if (!ehLista(primeiro)) return "";
  return comoTexto(primeiro[0]);
}

function extrairDeEnvelope(envelope: any): { assunto: string; remetente: string; remetenteNome: string; messageId: string } {
  if (!ehLista(envelope)) return { assunto: "", remetente: "", remetenteNome: "", messageId: "" };
  return {
    assunto: comoTexto(envelope[1]),
    remetente: extrairEnderecoDeEnvelope(envelope[2]),
    remetenteNome: extrairNomeDeEnvelope(envelope[2]),
    messageId: comoTexto(envelope[9]),
  };
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

  // Lê exactamente `n` bytes — usado para literais grandes (um anexo em
  // base64 pode ter vários MB). Aloca o destino UMA vez e escreve os
  // pedaços lidos directamente no sítio certo, em vez de recriar+copiar
  // o buffer acumulado a cada pedaço (como `#encherBuffer` faz,
  // aceitável para linhas curtas, mas quadrático — e portanto caro em
  // CPU — para literais de vários MB).
  async lerBytes(n: number): Promise<Uint8Array> {
    const resultado = new Uint8Array(n);
    const doBufferExistente = Math.min(this.#buffer.length, n);
    resultado.set(this.#buffer.subarray(0, doBufferExistente), 0);
    this.#buffer = this.#buffer.slice(doBufferExistente);

    let escrito = doBufferExistente;
    while (escrito < n) {
      const chunk = new Uint8Array(Math.min(n - escrito, 65536));
      const lido = await this.#conn.read(chunk);
      if (lido === null) throw new Error("Ligação IMAP fechada inesperadamente.");
      resultado.set(chunk.subarray(0, lido), escrito);
      escrito += lido;
    }
    return resultado;
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

export interface InfoMensagemIMAP {
  temPdf: boolean;
  dataRecebido: Date | null;
  assunto: string;
  remetente: string;
  remetenteNome: string;
  messageId: string;
  partePdf: string | null;   // número da parte MIME com o PDF, se identificada
  nomePdf: string;
  codificacaoPdf: string;
  parteTexto: string | null; // número da parte de texto (plain/html), se existir
  codificacaoTexto: string;
  tipoTexto: string;         // "plain" | "html" | ""
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

  async selecionarPasta(nome: string): Promise<void> {
    const resp = await this.#executar(`SELECT ${this.#aspas(nome)}`);
    if (!resp.ok) throw new Error(`SELECT ${nome} falhou: ${resp.linhas.join(" ")}`);
  }

  // Diagnóstico: nomes reais das pastas na caixa (podem não corresponder
  // ao que o webmail mostra — acentos/hierarquia às vezes vêm codificados
  // em UTF-7 modificado). Cada linha de resposta é tipo:
  // * LIST (\HasNoChildren) "/" "Faturas"
  async listarPastas(): Promise<string[]> {
    const resp = await this.#executar(`LIST "" "*"`);
    if (!resp.ok) return [];
    const nomes: string[] = [];
    for (const linha of resp.linhas) {
      const m = /^\* LIST \([^)]*\)\s+(?:"[^"]*"|NIL)\s+(?:"([^"]*)"|(\S+))/.exec(linha);
      if (m) nomes.push(m[1] ?? m[2]);
    }
    return nomes;
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

  // Mensagem completa em bruto — só como último recurso (ver imap.ts),
  // quando não foi possível identificar com confiança as partes por
  // BODYSTRUCTURE. Nunca é o caminho normal, é caro em CPU/memória.
  async obterMensagemCompleta(uid: string): Promise<Uint8Array> {
    const resp = await this.#executar(`UID FETCH ${uid} (BODY.PEEK[])`);
    if (!resp.ok || resp.literais.length === 0) throw new Error("Não foi possível obter a mensagem completa.");
    return resp.literais[0];
  }

  // Uma parte MIME específica (endereçada pelo número calculado a partir
  // do BODYSTRUCTURE) — usado para pedir só o texto (pequeno) ou só o
  // PDF (o que interessa mesmo guardar), nunca a mensagem toda.
  async obterParte(uid: string, numeroParte: string): Promise<Uint8Array> {
    const resp = await this.#executar(`UID FETCH ${uid} (BODY.PEEK[${numeroParte}])`);
    if (!resp.ok || resp.literais.length === 0) throw new Error(`Não foi possível obter a parte ${numeroParte} da mensagem.`);
    return resp.literais[0];
  }

  // Verificação em LOTE — estrutura MIME (BODYSTRUCTURE), remetente e
  // assunto (ENVELOPE) e data (INTERNALDATE) de várias mensagens dum só
  // pedido à rede, sem descarregar nenhum conteúdo. Este cliente não faz
  // pipelining — um pedido por mensagem seria demasiados round-trips
  // sequenciais para uma caixa com centenas/milhares de mensagens numa
  // janela. A partir daqui já se sabe, sem descarregar nada, em que
  // parte exacta está o texto e em que parte está o PDF (se existir).
  async verificarMensagens(uids: string[]): Promise<Map<string, InfoMensagemIMAP>> {
    const resultado = new Map<string, InfoMensagemIMAP>();
    if (uids.length === 0) return resultado;

    const resp = await this.#executar(`UID FETCH ${uids.join(",")} (UID BODYSTRUCTURE INTERNALDATE ENVELOPE)`);
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
      const uid = uidMatch[1];

      const tokens = tokenizar(texto);
      const pos = { i: 0 };
      while (tokens[pos.i] && tokens[pos.i].t !== "open") pos.i++;
      const dados = parsearValor(tokens, pos);

      let bodystructure: any = null;
      let envelope: any = null;
      if (ehLista(dados)) {
        for (let k = 0; k + 1 < dados.length; k += 2) {
          const chave = comoTexto(dados[k]).toUpperCase();
          if (chave === "BODYSTRUCTURE") bodystructure = dados[k + 1];
          else if (chave === "ENVELOPE") envelope = dados[k + 1];
        }
      }

      const partes: ParteMime[] = [];
      extrairPartesFolha(bodystructure, "", partes);

      const partePdf = partes.find(p => p.subtipo === "pdf" || /\.pdf$/i.test(p.nome)) ?? null;
      const parteTexto = partes.find(p => p.tipo === "text" && p.subtipo === "plain")
        ?? partes.find(p => p.tipo === "text" && p.subtipo === "html")
        ?? null;

      const { assunto, remetente, remetenteNome, messageId } = extrairDeEnvelope(envelope);
      // Sinal simples de reforço (texto contém "pdf" nalgum lado) — se o
      // parser de BODYSTRUCTURE não confirmar uma parte com confiança,
      // este sinal ainda avisa imap.ts para não desistir da mensagem.
      const temPdfTextoSimples = texto.toLowerCase().includes("pdf");

      resultado.set(uid, {
        temPdf: !!partePdf || temPdfTextoSimples,
        dataRecebido: extrairDataInterna(texto),
        assunto,
        remetente,
        remetenteNome,
        messageId,
        partePdf: partePdf ? partePdf.numero : null,
        nomePdf: partePdf ? partePdf.nome : "",
        codificacaoPdf: partePdf ? partePdf.codificacao : "",
        parteTexto: parteTexto ? parteTexto.numero : null,
        codificacaoTexto: parteTexto ? parteTexto.codificacao : "",
        tipoTexto: parteTexto ? parteTexto.subtipo : "",
      });
    }

    return resultado;
  }

  async fechar(): Promise<void> {
    try { await this.#executar("LOGOUT"); } catch { /* já não importa */ }
  }
}
