-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: fecha uma falha real. As funções telemetria-sync
-- e email-sync não verificavam quem as chamava — qualquer pessoa com a
-- chave anon/publishable (pública, vem embutida no HTML da app)
-- conseguia chamá-las directamente, forçando sincronizações de
-- qualquer empresa e, no caso da telemetria, via a resposta, matrículas
-- e KMs actuais de qualquer cliente.
--
-- Corre isto DEPOIS de:
--   1. Fazeres deploy de telemetria-sync e email-sync já actualizadas
--      (agora exigem o cabeçalho x-cron-secret).
--   2. Definires o segredo CRON_SECRET nos segredos das Edge Functions
--      (Supabase Dashboard → Edge Functions → Secrets) — usa uma
--      string aleatória longa, gerada por ti (não uses uma password
--      normal).
--
-- IMPORTANTE: substitui <A_TUA_PUBLISHABLE_KEY> e <O_TEU_CRON_SECRET>
-- abaixo pelos valores reais antes de correr (o CRON_SECRET tem de ser
-- exactamente igual ao que puseste nos segredos das Edge Functions).
-- ══════════════════════════════════════════════════════════════════

select cron.unschedule('telemetria-sync-diario');
select cron.unschedule('email-sync-periodico');

select cron.schedule(
  'telemetria-sync-diario',
  '0 5 * * *',
  $$
  select net.http_post(
    url     := 'https://yvnopdrsnhmfhikioots.supabase.co/functions/v1/telemetria-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <A_TUA_PUBLISHABLE_KEY>',
      'x-cron-secret',  '<O_TEU_CRON_SECRET>'
    )
  ) as request_id;
  $$
);

select cron.schedule(
  'email-sync-periodico',
  '0 */6 * * *',
  $$
  select net.http_post(
    url     := 'https://yvnopdrsnhmfhikioots.supabase.co/functions/v1/email-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <A_TUA_PUBLISHABLE_KEY>',
      'x-cron-secret',  '<O_TEU_CRON_SECRET>'
    )
  ) as request_id;
  $$
);

-- Para verificar que ficou tudo agendado:
-- select * from cron.job;
