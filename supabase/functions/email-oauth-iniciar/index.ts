// ── EMAIL OAUTH — INICIAR ────────────────────────────────────────────
// Chamada autenticada (JWT do utilizador) a partir da app: resolve a
// empresa do utilizador, gera um state assinado, e devolve a URL de
// autorização do fornecedor escolhido (?fornecedor=outlook por
// omissão). A app faz `fetch` a isto e só depois redirecciona o
// browser para a URL devolvida — um redirect de topo não conseguiria
// levar o cabeçalho Authorization.

import { obterEmpresaId } from "../_shared/auth.ts";
import { gerarState } from "../_shared/oauth-state.ts";
import { ADAPTADORES_EMAIL } from "../_shared/email-sync-logica.ts";
import { CORS_HEADERS, tratarPreflight } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/email-oauth-callback`;

Deno.serve(async (req) => {
  const preflight = tratarPreflight(req);
  if (preflight) return preflight;

  const empresaId = await obterEmpresaId(req);
  if (!empresaId) {
    return new Response(JSON.stringify({ erro: "Não autenticado ou sem empresa associada." }), { status: 401, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const fornecedor = url.searchParams.get("fornecedor") ?? "outlook";
  const adaptador = ADAPTADORES_EMAIL[fornecedor];
  if (!adaptador) {
    return new Response(JSON.stringify({ erro: `Fornecedor "${fornecedor}" não suportado.` }), { status: 400, headers: CORS_HEADERS });
  }

  const state = await gerarState(empresaId, fornecedor);
  const urlAutorizacao = adaptador.obterUrlAutorizacao(state, REDIRECT_URI);

  return new Response(JSON.stringify({ url: urlAutorizacao }), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
