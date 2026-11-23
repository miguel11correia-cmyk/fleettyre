// ── EMAIL — DESLIGAR ─────────────────────────────────────────────────
// Autenticado. Desliga UMA integração da PRÓPRIA empresa do utilizador
// (nunca de um empresa_id vindo do pedido) — pára a sincronização,
// não apaga os emails já apanhados. Uma empresa pode ter várias
// integrações activas em simultâneo (Outlook + Google + IMAP), por
// isso ?fornecedor= é obrigatório — identifica qual delas desligar,
// nunca "a activa" (deixou de haver só uma; sem isto arriscava-se a
// desligar todas de uma vez por engano).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { obterEmpresaId } from "../_shared/auth.ts";
import { corsHeaders, tratarPreflight } from "../_shared/cors.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const preflight = tratarPreflight(req);
  if (preflight) return preflight;

  const empresaId = await obterEmpresaId(req);
  if (!empresaId) {
    return new Response(JSON.stringify({ erro: "Não autenticado ou sem empresa associada." }), { status: 401, headers: corsHeaders(req) });
  }

  const url = new URL(req.url);
  const fornecedor = url.searchParams.get("fornecedor");
  if (!fornecedor) {
    return new Response(JSON.stringify({ ok: false, erro: "Falta indicar o fornecedor (?fornecedor=)." }), { status: 400, headers: corsHeaders(req) });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { error } = await sb
    .from("integracoes_email")
    .update({ ativo: false })
    .eq("empresa_id", empresaId)
    .eq("fornecedor", fornecedor);

  if (error) {
    return new Response(JSON.stringify({ ok: false, erro: error.message }), { status: 500, headers: corsHeaders(req) });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
});
