// ── PARSER MIME MÍNIMO ───────────────────────────────────────────────
// Extrai cabeçalhos e o primeiro anexo PDF de uma mensagem RFC822 em
// bruto. Trabalha a nível de bytes (não texto) porque o corpo pode ser
// binário — só os cabeçalhos e os boundaries multipart são tratados
// como texto ASCII/Latin-1, nunca o conteúdo dos anexos.

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
  // 7bit/8bit/binary/quoted-printable (raro em PDFs) — devolve tal como está.
  return bytes;
}

function nomeDoAnexo(cabecalhos: Record<string, string>): string {
  const disposicao = cabecalhos["content-disposition"] || "";
  const tipo = cabecalhos["content-type"] || "";
  const m = /filename\*?=("?)([^";]+)\1/i.exec(disposicao) || /name\*?=("?)([^";]+)\1/i.exec(tipo);
  return m ? descodificarTextoCabecalho(m[2]) : "anexo.pdf";
}

interface AnexoPdf {
  nome: string;
  bytes: Uint8Array;
}

// Percorre (recursivamente) as partes multipart à procura da primeira com
// Content-Type application/pdf (ou nome a acabar em .pdf).
function procurarPdfEmParte(bytes: Uint8Array): AnexoPdf | null {
  const fimCabecalhos = encontrarSequencia(bytes, CRLFCRLF);
  if (fimCabecalhos === -1) return null;

  const textoCabecalhos = new TextDecoder("latin1").decode(bytes.slice(0, fimCabecalhos));
  const corpo = bytes.slice(fimCabecalhos + 4);
  const cabecalhos = parsearCabecalhos(textoCabecalhos);
  const tipoConteudo = (cabecalhos["content-type"] || "").toLowerCase();

  if (tipoConteudo.startsWith("multipart/")) {
    const m = /boundary="?([^";]+)"?/i.exec(cabecalhos["content-type"] || "");
    if (!m) return null;
    const boundary = new TextEncoder().encode(`--${m[1]}`);

    let pos = 0;
    const partes: Uint8Array[] = [];
    while (true) {
      const inicio = encontrarSequencia(corpo, boundary, pos);
      if (inicio === -1) break;
      const proximo = encontrarSequencia(corpo, boundary, inicio + boundary.length);
      if (proximo === -1) break;
      // +2 para saltar o \r\n a seguir ao boundary
      partes.push(corpo.slice(inicio + boundary.length + 2, proximo));
      pos = proximo;
    }

    for (const parte of partes) {
      const encontrado = procurarPdfEmParte(parte);
      if (encontrado) return encontrado;
    }
    return null;
  }

  const ehPdf = tipoConteudo.startsWith("application/pdf") || /\.pdf/i.test(nomeDoAnexo(cabecalhos));
  if (!ehPdf) return null;

  const transferEncoding = cabecalhos["content-transfer-encoding"] || "7bit";
  return { nome: nomeDoAnexo(cabecalhos), bytes: descodificarCorpo(corpo, transferEncoding) };
}

export function extrairPrimeiroPdf(mensagemCompleta: Uint8Array): AnexoPdf | null {
  return procurarPdfEmParte(mensagemCompleta);
}
