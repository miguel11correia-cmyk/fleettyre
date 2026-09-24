-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: substitui o agendamento diário da antiga
-- `cartrack-sync` pelo da nova `telemetria-sync` (genérica, por
-- empresa + fornecedor). Corre isto DEPOIS de:
--   1. Correres a 020_integracoes_telemetria.sql (com o backfill).
--   2. Fazeres deploy da função `telemetria-sync` no Supabase CLI e
--      removeres a antiga `cartrack-sync`.
--
-- IMPORTANTE: substitui <A_TUA_PUBLISHABLE_KEY> abaixo pela tua chave
-- publishable/anon (Settings → API Keys no Supabase) antes de correr.
-- ══════════════════════════════════════════════════════════════════

select cron.unschedule('cartrack-sync-diario');

select cron.schedule(
  'telemetria-sync-diario',
  '0 5 * * *',
  $$
  select net.http_post(
    url     := 'https://yvnopdrsnhmfhikioots.supabase.co/functions/v1/telemetria-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <A_TUA_PUBLISHABLE_KEY>'
    )
  ) as request_id;
  $$
);

-- Para verificar que ficou agendado:
-- select * from cron.job;
