-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: campo para o km actual (via integração
-- Cartrack), só informativo — não substitui os kms manuais dos
-- registos de pneus. Corre isto no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════

alter table public.veiculos add column if not exists km_atual    integer;
alter table public.veiculos add column if not exists km_atual_em timestamptz;
