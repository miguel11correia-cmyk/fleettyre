// ── PARSER MIME MÍNIMO ───────────────────────────────────────────────
// Extrai cabeçalhos, o primeiro anexo PDF, e um resumo do texto do
// corpo de uma mensagem RFC822 em bruto. Trabalha a nível de bytes (não
// texto) porque o corpo pode ser binário — só os cabeçalhos e os
// boundaries multipart são tratados como texto ASCII/Latin-1, nunca o
// conteúdo dos anexos.

const CRLFCRLF = new Uint8Array([13, 10, 13, 10]);

function encontrarSequencia(bytes: Uint8Array, seq: Uint8Array, desde = 0): number {
  outer: for (let i = desde; i <= bytes.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) {
      if (bytes[i + j] !== seq[j]) continue outer;
    }
    return i;
  }
  return -1;
}

// Desdobra cabeçalhos multi-linha (RFC 5322: linha de continuação começa
// com espaço/tab) e devolve um mapa nome-em-minúsculas → valor.
export function parsearCabecalhos(textoCabecalhos: string): Record<string, string> {
  const linhasCruas = textoCabecalhos.split(/\r\n/);
  const linhas: string[] = [];
  for (const linha of linhasCruas) {
    if (/^[ \t]/.test(linha) && linhas.length > 0) {
      linhas[linhas.length - 1] += " " + linha.trim();
    } else if (linha.trim() !== "") {
      linhas.push(linha);
    }
  }

  const cabecalhos: Record<string, string> = {};
  for (const linha of linhas) {
    const idx = linha.indexOf(":");
    if (idx === -1) continue;
    const nome = linha.slice(0, idx).trim().toLowerCase();
    const valor = linha.slice(idx + 1).trim();
    cabecalhos[nome] = valor;
  }
  return cabecalhos;
}

// Descodifica "encoded-words" RFC 2047 (=?UTF-8?B?...?= ou ?Q?), comuns em
// assuntos/remetentes com acentos. Ignora o que não reconhecer.
export function descodificarTextoCabecalho(valor: string): string {
  return valor.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, charset, tipo, conteudo) => {
    try {
      if (tipo.toLowerCase() === "b") {
        const bin = atob(conteudo);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder(charset || "utf-8").decode(bytes);
      }
      // Quoted-printable: "_" = espaço, "=XX" = byte hexadecimal
      const semUnderscore = conteudo.replace(/_/g, " ");
      const bytes: number[] = [];
      for (let i = 0; i < semUnderscore.length; i++) {
        if (semUnderscore[i] === "=" && i + 2 < semUnderscore.length) {
          bytes.push(parseInt(semUnderscore.slice(i + 1, i + 3), 16));
          i += 2;
        } else {
          bytes.push(semUnderscore.charCodeAt(i));
        }
      }
      return new TextDecoder(charset || "utf-8").decode(new Uint8Array(bytes));
    } catch {
      return conteudo;
    }
  });
}

function descodificarCorpo(bytes: Uint8Array, transferEncoding: string): Uint8Array {
  const enc = transferEncoding.toLowerCase();
  if (enc === "base64") {
    // Remove quebras de linha antes de descodificar.
    const texto = new TextDecoder("latin1").decode(bytes).replace(/[\r\n]/g, "");
    const bin = atob(texto);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // 7bit/8bit/binary — devolve tal como está. Quoted-printable só é
  // descodificado no texto (ver extrairResumoTexto), não é preciso aqui.
  return bytes;
}

function nomeDoAnexo(cabecalhos: Record<string, string>): string {
  const disposicao = cabecalhos["content-disposition"] || "";
  const tipo = cabecalhos["content-type"] || "";
  const m = /filename\*?=("?)([^";]+)\1/i.exec(disposicao) || /name\*?=("?)([^";]+)\1/i.exec(tipo);
  return m ? descodificarTextoCabecalho(m[2]) : "";
}

interface ParteFolha {
  cabecalhos: Record<string, string>;
  tipoConteudo: string; // já em minúsculas
  bytes: Uint8Array; // corpo desta parte, JÁ descodificado (base64, etc.)
}

// Percorre (recursivamente) a árvore multipart e devolve todas as
// partes "folha" (não multipart), cada uma já com o corpo descodificado.
function percorrerPartesFolha(bytes: Uint8Array): ParteFolha[] {
  const fimCabecalhos = encontrarSequencia(bytes, CRLFCRLF);
  if (fimCabecalhos === -1) return [];

  const textoCabecalhos = new TextDecoder("latin1").decode(bytes.slice(0, fimCabecalhos));
  const corpo = bytes.slice(fimCabecalhos + 4);
  const cabecalhos = parsearCabecalhos(textoCabecalhos);
  const tipoConteudo = (cabecalhos["content-type"] || "").toLowerCase();

  if (tipoConteudo.startsWith("multipart/")) {
    const m = /boundary="?([^";]+)"?/i.exec(cabecalhos["content-type"] || "");
    if (!m) return [];
    const boundary = new TextEncoder().encode(`--${m[1]}`);

    let pos = 0;
    const partesCruas: Uint8Array[] = [];
    while (true) {
      const inicio = encontrarSequencia(corpo, boundary, pos);
      if (inicio === -1) break;
      const proximo = encontrarSequencia(corpo, boundary, inicio + boundary.length);
      if (proximo === -1) break;
      // +2 para saltar o \r\n a seguir ao boundary
      partesCruas.push(corpo.slice(inicio + boundary.length + 2, proximo));
      pos = proximo;
    }

    return partesCruas.flatMap(percorrerPartesFolha);
  }

  const transferEncoding = cabecalhos["content-transfer-encoding"] || "7bit";
  return [{ cabecalhos, tipoConteudo, bytes: descodificarCorpo(corpo, transferEncoding) }];
}

interface AnexoPdf {
  nome: string;
  bytes: Uint8Array;
}

export function extrairPrimeiroPdf(mensagemCompleta: Uint8Array): AnexoPdf | null {
  const partes = percorrerPartesFolha(mensagemCompleta);
  for (const parte of partes) {
    const nome = nomeDoAnexo(parte.cabecalhos);
    const ehPdf = parte.tipoConteudo.startsWith("application/pdf") || /\.pdf$/i.test(nome);
    if (ehPdf) return { nome: nome || "anexo.pdf", bytes: parte.bytes };
  }
  return null;
}

function removerTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function descodificarQuotedPrintable(texto: string): string {
  return texto
    .replace(/=\r?\n/g, "") // "soft line break"
    .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// Resumo do corpo (texto simples, ou HTML sem tags), truncado — só para
// o filtro de palavras-chave apanhar facturas com assunto vago.
const TAMANHO_RESUMO = 800;

export function extrairResumoTexto(mensagemCompleta: Uint8Array): string {
  const partes = percorrerPartesFolha(mensagemCompleta);

  const parteTexto = partes.find(p => p.tipoConteudo.startsWith("text/plain"))
    ?? partes.find(p => p.tipoConteudo.startsWith("text/html"));
  if (!parteTexto) return "";

  const charsetMatch = /charset="?([^";]+)"?/i.exec(parteTexto.cabecalhos["content-type"] || "");
  let texto: string;
  try {
    texto = new TextDecoder(charsetMatch?.[1] || "utf-8").decode(parteTexto.bytes);
  } catch {
    texto = new TextDecoder("latin1").decode(parteTexto.bytes);
  }

  if ((parteTexto.cabecalhos["content-transfer-encoding"] || "").toLowerCase() === "quoted-printable") {
    texto = descodificarQuotedPrintable(texto);
  }
  if (parteTexto.tipoConteudo.startsWith("text/html")) {
    texto = removerTags(texto);
  }

  return texto.slice(0, TAMANHO_RESUMO);
}
