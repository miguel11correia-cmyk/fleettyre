// ── EMAIL STATUS ──────────────────────────────────────────────────
// Autenticado. Devolve só o estado da integração da própria empresa —
// nunca os tokens (por isso esta função existe: o frontend não pode
// ler integracoes_email directamente, é só-admin por guardar credenciais).

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
  const { data } = await sb
    .from("integracoes_email")
    .select("conta_email, ativo, ultima_sincronizacao")
    .eq("empresa_id", empresaId)
    .eq("fornecedor", fornecedor)
    .maybeSingle();

  return new Response(JSON.stringify({
    ligado: !!data?.ativo,
    conta_email: data?.conta_email ?? null,
    ultima_sincronizacao: data?.ultima_sincronizacao ?? null,
  }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
});
