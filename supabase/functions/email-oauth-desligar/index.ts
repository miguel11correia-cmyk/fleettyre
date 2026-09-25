// ── EMAIL OAUTH — DESLIGAR ───────────────────────────────────────────
// Autenticado. Desliga a integração da PRÓPRIA empresa do utilizador
// (nunca de um empresa_id vindo do pedido) — pára a sincronização, não
// apaga os emails já apanhados.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { obterEmpresaId } from "../_shared/auth.ts";
import { CORS_HEADERS, tratarPreflight } from "../_shared/cors.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const preflight = tratarPreflight(req);
  if (preflight) return preflight;

  const empresaId = await obterEmpresaId(req);
  if (!empresaId) {
    return new Response(JSON.stringify({ erro: "Não autenticado ou sem empresa associada." }), { status: 401, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const fornecedor = url.searchParams.get("fornecedor") ?? "outlook";

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { error } = await sb
    .from("integracoes_email")
    .update({ ativo: false })
    .eq("empresa_id", empresaId)
    .eq("fornecedor", fornecedor);

  if (error) {
    return new Response(JSON.stringify({ ok: false, erro: error.message }), { status: 500, headers: CORS_HEADERS });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
});
