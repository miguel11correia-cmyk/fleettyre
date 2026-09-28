// ── TELEMETRIA SYNC ──────────────────────────────────────────────
// Edge Function genérica (cron/admin, sem verificação de quem chamou —
// só é invocada pelo pg_cron) que percorre TODAS as integrações de
// telemetria activas e sincroniza cada uma. O botão "Sincronizar agora"
// da app chama telemetria-sync-manual, não esta.
//
// Parâmetros opcionais na URL (para testar sem mexer em todas as
// empresas de uma vez):
//   ?empresa_id=<uuid>   só sincroniza essa empresa
//   ?limite=<n>          só os primeiros N veículos dessa/essas empresas
//
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injectados
// automaticamente pelo Supabase em toda a Edge Function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sincronizarIntegracaoTelemetria } from "../_shared/telemetria-sync-logica.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const url       = new URL(req.url);
  const empresaId = url.searchParams.get("empresa_id");
  const limite    = parseInt(url.searchParams.get("limite") ?? "") || null;

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let query = sb.from("integracoes_telemetria").select("id, empresa_id, fornecedor, credenciais").eq("ativo", true);
  if (empresaId) query = query.eq("empresa_id", empresaId);

  const { data: integracoes, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ erro: error.message }), { status: 500 });
  }

  const resultados = [];
  for (const integ of integracoes ?? []) {
    resultados.push(await sincronizarIntegracaoTelemetria(sb, integ, limite));
  }

  return new Response(JSON.stringify({ integracoes: resultados }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
