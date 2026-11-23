// ── EMAIL STATUS ──────────────────────────────────────────────────
// Autenticado. Devolve TODAS as integrações activas da própria empresa
// (uma empresa pode ter várias ao mesmo tempo, incluindo mais do que
// uma do MESMO fornecedor — ex.: duas caixas IMAP distintas — não há
// conflito nenhum em integracoes_email para isso) — nunca os tokens
// (por isso esta função existe: o frontend não pode ler
// integracoes_email directamente, é só-admin por guardar credenciais).
// Inclui o `id` de cada linha — email-sync-manual/email-oauth-desligar
// identificam sempre uma integração por `id`, nunca só por
// `fornecedor` (deixou de ser único por empresa).

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

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data } = await sb
    .from("integracoes_email")
    .select("id, fornecedor, conta_email, ultima_sincronizacao")
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .order("created_at", { ascending: false });

  return new Response(JSON.stringify({
    integracoes: data ?? [],
  }), { headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
});
