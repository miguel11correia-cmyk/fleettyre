-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: distinguir "Remix" (feito pelo fabricante,
-- ex: Michelin) de "Rechapado" (feito em oficina independente)
-- Corre isto no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════

-- pneus.tipo — alargar o check constraint para incluir 'Rechapado'
alter table public.pneus drop constraint if exists pneus_tipo_check;
alter table public.pneus add constraint pneus_tipo_check
  check (tipo in ('Novo', 'Remix', 'Piso Aberto', 'Rechapado'));

-- reboques.tipo — mesma alteração (no-op se ainda não existir constraint)
alter table public.reboques drop constraint if exists reboques_tipo_check;
alter table public.reboques add constraint reboques_tipo_check
  check (tipo in ('Novo', 'Remix', 'Piso Aberto', 'Rechapado'));
