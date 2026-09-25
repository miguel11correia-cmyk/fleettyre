-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: agenda a sincronização de emails de
-- fornecedores para correr sozinha, de 6 em 6 horas. Corre isto DEPOIS
-- de:
--   1. Correres a 022_integracoes_email.sql.
--   2. Fazeres deploy de todas as funções novas
--      (email-oauth-iniciar, email-oauth-callback, email-oauth-desligar,
--      email-status, email-sync, email-sync-manual) via Supabase CLI.
--   3. Desligares "Verify JWT" nas definições de email-oauth-callback
--      no Dashboard (Edge Functions → email-oauth-callback → Settings).
--
-- IMPORTANTE: substitui <A_TUA_PUBLISHABLE_KEY> abaixo pela tua chave
-- publishable/anon (Settings → API Keys no Supabase) antes de correr.
-- ══════════════════════════════════════════════════════════════════

select cron.schedule(
  'email-sync-periodico',
  '0 */6 * * *',
  $$
  select net.http_post(
    url     := 'https://yvnopdrsnhmfhikioots.supabase.co/functions/v1/email-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <A_TUA_PUBLISHABLE_KEY>'
    )
  ) as request_id;
  $$
);

-- Para verificar que ficou agendado:
-- select * from cron.job;

-- Para cancelar o agendamento, se um dia quiseres parar:
-- select cron.unschedule('email-sync-periodico');
