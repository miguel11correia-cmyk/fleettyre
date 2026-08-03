-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: registo de frota (veículos e reboques)
-- Corre isto no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════

-- 1. VEÍCULOS (camiões/tractores)
create table if not exists public.veiculos (
  id            bigserial primary key,
  created_at    timestamptz default now(),
  empresa_id    uuid references public.empresas(id),
  matricula     text not null,
  marca         text,
  modelo        text,
  ano           integer,
  tipo          text, -- Tractor, Rígido, Outro
  num_eixos     integer,
  reboque_hab   text, -- matrícula do reboque habitual
  observacoes   text,
  ativo         boolean default true
);

create unique index if not exists idx_veiculos_matricula_empresa
  on public.veiculos (matricula, empresa_id);

alter table public.veiculos enable row level security;

drop policy if exists "Acesso por empresa ou admin" on public.veiculos;
create policy "Acesso por empresa ou admin"
  on public.veiculos for all
  using (
    empresa_id in (select empresa_id from public.membros where user_id = auth.uid())
    or exists (select 1 from public.admins where user_id = auth.uid())
  )
  with check (
    empresa_id in (select empresa_id from public.membros where user_id = auth.uid())
    or exists (select 1 from public.admins where user_id = auth.uid())
  );

-- 2. REBOQUES — FICHA DE FROTA (equivalente a veiculos, sem reboque_hab)
create table if not exists public.reboques_frota (
  id            bigserial primary key,
  created_at    timestamptz default now(),
  empresa_id    uuid references public.empresas(id),
  matricula     text not null,
  marca         text,
  modelo        text,
  ano           integer,
  tipo          text, -- Semirreboque, Reboque, Cisterna, Frigorífico, Outro
  num_eixos     integer,
  observacoes   text,
  ativo         boolean default true
);

create unique index if not exists idx_reboques_frota_matricula_empresa
  on public.reboques_frota (matricula, empresa_id);

alter table public.reboques_frota enable row level security;

drop policy if exists "Acesso por empresa ou admin" on public.reboques_frota;
create policy "Acesso por empresa ou admin"
  on public.reboques_frota for all
  using (
    empresa_id in (select empresa_id from public.membros where user_id = auth.uid())
    or exists (select 1 from public.admins where user_id = auth.uid())
  )
  with check (
    empresa_id in (select empresa_id from public.membros where user_id = auth.uid())
    or exists (select 1 from public.admins where user_id = auth.uid())
  );
