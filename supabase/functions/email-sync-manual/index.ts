// ── EMAIL SYNC MANUAL ─────────────────────────────────────────────
// Autenticado — é isto que o botão "Sincronizar agora" da app chama,
// nunca email-sync directamente (essa usa a service role key sem
// verificar quem pediu, só serve para ser chamada pelo pg_cron). Aqui
// a empresa é sempre derivada do JWT do utilizador, nunca de um
// parâmetro do pedido — um utilizador normal não consegue forçar a
// sincronização de outra empresa.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { obterEmpresaId } from "../_shared/auth.ts";
import { sincronizarIntegracao } from "../_shared/email-sync-logica.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const empresaId = await obterEmpresaId(req);
  if (!empresaId) {
    return new Response(JSON.stringify({ erro: "Não autenticado ou sem empresa associada." }), { status: 401 });
  }

  const url = new URL(req.url);
  const fornecedor = url.searchParams.get("fornecedor") ?? "outlook";

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: integ, error } = await sb
    .from("integracoes_email")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("fornecedor", fornecedor)
    .eq("ativo", true)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ ok: false, erro: error.message }), { status: 500 });
  }
  if (!integ) {
    return new Response(JSON.stringify({ ok: false, erro: "Sem integração de email activa." }), { status: 400 });
  }

  const resultado = await sincronizarIntegracao(sb, integ);
  return new Response(JSON.stringify(resultado), { headers: { "Content-Type": "application/json" } });
});
