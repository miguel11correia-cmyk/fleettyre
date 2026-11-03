-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: renomear "escultura_final" para "rasto_final"
-- (pneus e reboques), para acompanhar a mudança de nomenclatura na
-- app. RENAME COLUMN preserva os dados e os constraints existentes
-- (check, índices) — só muda o nome. Corre isto no SQL Editor do
-- Supabase.
-- ══════════════════════════════════════════════════════════════════

alter table public.pneus    rename column escultura_final to rasto_final;
alter table public.reboques rename column escultura_final to rasto_final;
