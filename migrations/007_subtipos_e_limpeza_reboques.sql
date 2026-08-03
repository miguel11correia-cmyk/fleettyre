-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: subtipos por marca + limpeza do campo posição
-- em reboques (redundante com o eixo). Corre isto no SQL Editor do
-- Supabase.
-- ══════════════════════════════════════════════════════════════════

-- 1. REMOVER "posicao" DE REBOQUES — redundante com "eixo"
alter table public.reboques drop column if exists posicao;

-- 2. SUBTIPOS DE MARCA (ex: Michelin -> "XTRA LIFE")
create table if not exists public.subtipos_marca (
  id          bigserial primary key,
  created_at  timestamptz default now(),
  empresa_id  uuid references public.empresas(id),
  marca_id    bigint references public.marcas(id) on delete cascade,
  nome        text not null
);

create unique index if not exists idx_subtipos_marca_unico
  on public.subtipos_marca (marca_id, nome, empresa_id);

alter table public.subtipos_marca enable row level security;

drop policy if exists "Acesso por empresa ou admin" on public.subtipos_marca;
create policy "Acesso por empresa ou admin"
  on public.subtipos_marca for all
  using (
    empresa_id in (select empresa_id from public.membros where user_id = auth.uid())
    or exists (select 1 from public.admins where user_id = auth.uid())
  )
  with check (
    empresa_id in (select empresa_id from public.membros where user_id = auth.uid())
    or exists (select 1 from public.admins where user_id = auth.uid())
  );

-- 3. CAMPO "subtipo" NOS REGISTOS DE PNEU (veículos e reboques)
alter table public.pneus    add column if not exists subtipo text;
alter table public.reboques add column if not exists subtipo text;
