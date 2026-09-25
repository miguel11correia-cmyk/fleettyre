// ── STATE OAUTH ASSINADO ─────────────────────────────────────────────
// Em vez de uma tabela para guardar o "state" do fluxo OAuth (mais uma
// tabela, mais limpeza), o state é auto-contido e assinado por HMAC:
// {empresa_id, fornecedor, nonce, exp} + assinatura. email-oauth-callback
// verifica a assinatura e a validade — não confia em mais nada do pedido.

const OAUTH_STATE_SECRET = Deno.env.get("OAUTH_STATE_SECRET") ?? "";
const VALIDADE_MS = 10 * 60 * 1000; // 10 minutos — só o tempo de completar o consentimento

export interface PayloadState {
  empresa_id: string;
  fornecedor: string;
  nonce: string;
  exp: number; // epoch ms
}

function paraBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + (4 - (s.length % 4)) % 4, "=");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function assinar(dados: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(OAUTH_STATE_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const assinatura = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(dados));
  return paraBase64Url(new Uint8Array(assinatura));
}

export async function gerarState(empresaId: string, fornecedor: string): Promise<string> {
  const payload: PayloadState = {
    empresa_id: empresaId,
    fornecedor,
    nonce: crypto.randomUUID(),
    exp: Date.now() + VALIDADE_MS,
  };
  const dados = paraBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const assinatura = await assinar(dados);
  return `${dados}.${assinatura}`;
}

// Devolve o payload se o state for válido e não tiver expirado, ou null.
export async function validarState(state: string): Promise<PayloadState | null> {
  const [dados, assinatura] = state.split(".");
  if (!dados || !assinatura) return null;

  const assinaturaEsperada = await assinar(dados);
  if (assinatura !== assinaturaEsperada) return null;

  try {
    const payload: PayloadState = JSON.parse(new TextDecoder().decode(deBase64Url(dados)));
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
