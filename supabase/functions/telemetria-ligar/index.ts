// ── TELEMETRIA — LIGAR ───────────────────────────────────────────────
// Autenticado. Recebe fornecedor + credenciais, TESTA-as antes de
// gravar (não garante que tudo vai correr bem depois, só apanha
// credenciais erradas óbvias), e grava em integracoes_telemetria.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { obterEmpresaId } from "../_shared/auth.ts";
import { ADAPTADORES_TELEMETRIA } from "../_shared/telemetria-sync-logica.ts";
import { CORS_HEADERS, tratarPreflight } from "../_shared/cors.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const preflight = tratarPreflight(req);
  if (preflight) return preflight;

  const empresaId = await obterEmpresaId(req);
  if (!empresaId) {
    return new Response(JSON.stringify({ ok: false, erro: "Não autenticado ou sem empresa associada." }), { status: 401, headers: CORS_HEADERS });
  }

  let dados: any;
  try { dados = await req.json(); } catch { dados = {}; }

  const fornecedor  = String(dados.fornecedor || "").trim();
  const credenciais = dados.credenciais || {};

  const adaptador = ADAPTADORES_TELEMETRIA[fornecedor];
  if (!adaptador) {
    return new Response(JSON.stringify({ ok: false, erro: `Fornecedor "${fornecedor}" não suportado.` }), { status: 400, headers: CORS_HEADERS });
  }

  const credenciaisOk = await adaptador.testarCredenciais(credenciais);
  if (!credenciaisOk) {
    return new Response(JSON.stringify({ ok: false, erro: "Não foi possível validar as credenciais — confirma os dados." }), { status: 400, headers: CORS_HEADERS });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { error } = await sb.from("integracoes_telemetria").upsert(
    { empresa_id: empresaId, fornecedor, credenciais, ativo: true },
    { onConflict: "empresa_id,fornecedor" }
  );

  if (error) {
    return new Response(JSON.stringify({ ok: false, erro: error.message }), { status: 500, headers: CORS_HEADERS });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
});
