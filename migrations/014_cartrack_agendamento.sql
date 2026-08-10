-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: agenda a sincronização com a Cartrack para
-- correr sozinha, uma vez por dia. Corre isto no SQL Editor do
-- Supabase.
--
-- Usa pg_cron (agendador) + pg_net (para fazer o pedido HTTP à Edge
-- Function) — ambas extensões nativas do Supabase, só é preciso
-- activá-las.
--
-- Horário: 05:00 UTC (≈ 06:00 em Portugal no horário de Verão, 05:00
-- no horário de Inverno) — antes do início do dia de trabalho.
-- ══════════════════════════════════════════════════════════════════

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

select cron.schedule(
  'cartrack-sync-diario',
  '0 5 * * *',
  $$
  select net.http_post(
    url     := 'https://yvnopdrsnhmfhikioots.supabase.co/functions/v1/cartrack-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer sb_publishable_YhrR_RC6-5pwfouudB2WrQ_ah-H3lxZ'
    )
  ) as request_id;
  $$
);

-- Para verificar que ficou agendado:
-- select * from cron.job;

-- Para cancelar o agendamento, se um dia quiseres parar:
-- select cron.unschedule('cartrack-sync-diario');
