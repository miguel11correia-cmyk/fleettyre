-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: subtipo nas linhas de fatura de stock, e
-- fornecedor do serviço (rechapagem/remix/abrir piso) nos pneus e
-- reboques desmontados em armazém. Corre isto no SQL Editor do
-- Supabase.
-- ══════════════════════════════════════════════════════════════════

alter table public.stock_linhas add column if not exists subtipo text;

alter table public.pneus    add column if not exists fornecedor_pronto text;
alter table public.reboques add column if not exists fornecedor_pronto text;
