// ── EMAIL SYNC ────────────────────────────────────────────────────
// Edge Function agendada (pg_cron) que percorre TODAS as integrações
// de email activas e sincroniza cada uma (ver _shared/email-sync-logica.ts).
//
// Parâmetros opcionais na URL (para testar sem mexer em todas as
// empresas de uma vez):
//   ?empresa_id=<uuid>   só sincroniza essa empresa
//
// Nota: isto usa a service role key e não verifica quem chamou — só é
// invocada pelo pg_cron. O botão "Sincronizar agora" da app chama
// email-sync-manual, que deriva a empresa do JWT do utilizador.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sincronizarIntegracao } from "../_shared/email-sync-logica.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const url       = new URL(req.url);
  const empresaId = url.searchParams.get("empresa_id");

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let query = sb.from("integracoes_email").select("*").eq("ativo", true);
  if (empresaId) query = query.eq("empresa_id", empresaId);

  const { data: integracoes, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ erro: error.message }), { status: 500 });
  }

  const resultados = [];
  for (const integ of integracoes ?? []) {
    resultados.push(await sincronizarIntegracao(sb, integ));
  }

  return new Response(JSON.stringify({ integracoes: resultados }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
