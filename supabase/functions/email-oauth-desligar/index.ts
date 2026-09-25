// ── EMAIL — DESLIGAR ─────────────────────────────────────────────────
// Autenticado. Desliga a integração ACTIVA da PRÓPRIA empresa do
// utilizador (nunca de um empresa_id vindo do pedido), seja ela
// Outlook ou IMAP — pára a sincronização, não apaga os emails já
// apanhados. Aceita ?fornecedor= opcional para desligar um fornecedor
// específico; sem isso, desliga o que estiver activo.

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
  const fornecedor = url.searchParams.get("fornecedor");

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  let query = sb.from("integracoes_email").update({ ativo: false }).eq("empresa_id", empresaId);
  if (fornecedor) query = query.eq("fornecedor", fornecedor);
  else query = query.eq("ativo", true);

  const { error } = await query;

  if (error) {
    return new Response(JSON.stringify({ ok: false, erro: error.message }), { status: 500, headers: CORS_HEADERS });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
});
