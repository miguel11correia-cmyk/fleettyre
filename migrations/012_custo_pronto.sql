-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: valor do serviço de oficina (rechapagem,
-- remix, etc.) ao marcar um pneu desmontado como "pronto" no Stock.
-- Corre isto no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════

alter table public.pneus    add column if not exists custo_pronto numeric(8,2) check (custo_pronto is null or custo_pronto >= 0);
alter table public.reboques add column if not exists custo_pronto numeric(8,2) check (custo_pronto is null or custo_pronto >= 0);
