-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: regista quando cada integração de telemetria
-- foi sincronizada pela última vez, para mostrar na página de
-- "Integração de telemetria" (Por matrícula). Corre isto no SQL
-- Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════

alter table public.integracoes_telemetria
  add column if not exists ultima_sincronizacao timestamptz;
