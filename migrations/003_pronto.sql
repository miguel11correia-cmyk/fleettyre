-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: distinguir pneus desmontados (Abrir Piso /
-- Remix / Rechapar) que já voltaram prontos da oficina dos que ainda
-- estão à espera. Corre isto no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════

alter table public.pneus    add column if not exists pronto boolean not null default false;
alter table public.reboques add column if not exists pronto boolean not null default false;
