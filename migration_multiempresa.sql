-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração para multi-empresa (multi-tenancy)
-- Corre isto no SQL Editor do Supabase DEPOIS do supabase_setup.sql
-- ══════════════════════════════════════════════════════════════════

-- 1. TABELA DE EMPRESAS
create table if not exists public.empresas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  created_at  timestamptz default now()
);

-- 2. LIGAÇÃO UTILIZADOR ↔ EMPRESA (1 empresa por utilizador)
create table if not exists public.membros (
  user_id     uuid primary key references auth.users(id),
  empresa_id  uuid references public.empresas(id) not null,
  created_at  timestamptz default now()
);

-- 3. UTILIZADORES COM ACESSO GLOBAL (a todas as empresas, actuais e futuras)
create table if not exists public.admins (
  user_id     uuid primary key references auth.users(id)
);

-- 4. ADICIONAR empresa_id ÀS TABELAS DE DADOS
alter table public.pneus         add column if not exists empresa_id uuid references public.empresas(id);
alter table public.reboques      add column if not exists empresa_id uuid references public.empresas(id);
alter table public.stock_faturas add column if not exists empresa_id uuid references public.empresas(id);
alter table public.fornecedores  add column if not exists empresa_id uuid references public.empresas(id);
alter table public.marcas        add column if not exists empresa_id uuid references public.empresas(id);
-- stock_linhas não tem empresa_id próprio — herda o âmbito via stock_faturas.fatura_id

create index if not exists idx_pneus_empresa         on public.pneus (empresa_id);
create index if not exists idx_reboques_empresa       on public.reboques (empresa_id);
create index if not exists idx_stock_faturas_empresa  on public.stock_faturas (empresa_id);
create index if not exists idx_fornecedores_empresa   on public.fornecedores (empresa_id);
create index if not exists idx_marcas_empresa         on public.marcas (empresa_id);

-- 5. SEED — criar a Transaura e atribuir-te como membro + admin global
insert into public.empresas (id, nome)
values ('00000000-0000-0000-0000-000000000001', 'Transaura Transportes Lda')
on conflict (id) do nothing;

insert into public.membros (user_id, empresa_id)
select id, '00000000-0000-0000-0000-000000000001'
from auth.users
where email = 'miguel.11.correia@gmail.com'
on conflict (user_id) do update set empresa_id = excluded.empresa_id;

insert into public.admins (user_id)
select id from auth.users where email = 'miguel.11.correia@gmail.com'
on conflict (user_id) do nothing;

-- 6. BACKFILL — atribuir todos os registos actuais à Transaura
update public.pneus         set empresa_id = '00000000-0000-0000-0000-000000000001' where empresa_id is null;
update public.reboques      set empresa_id = '00000000-0000-0000-0000-000000000001' where empresa_id is null;
update public.stock_faturas set empresa_id = '00000000-0000-0000-0000-000000000001' where empresa_id is null;
update public.fornecedores  set empresa_id = '00000000-0000-0000-0000-000000000001' where empresa_id is null;
update public.marcas        set empresa_id = '00000000-0000-0000-0000-000000000001' where empresa_id is null;

-- 7. Tornar empresa_id obrigatório daqui para a frente
alter table public.pneus         alter column empresa_id set not null;
alter table public.reboques      alter column empresa_id set not null;
alter table public.stock_faturas alter column empresa_id set not null;
alter table public.fornecedores  alter column empresa_id set not null;
alter table public.marcas        alter column empresa_id set not null;

-- 8. SUBSTITUIR AS POLÍTICAS RLS ANTIGAS (acesso a qualquer autenticado) POR ACESSO POR EMPRESA

drop policy if exists "Acesso autenticado" on public.pneus;

create policy "Acesso por empresa ou admin"
  on public.pneus
  for all
  using (
    empresa_id in (select empresa_id from public.membros where user_id = auth.uid())
    or exists (select 1 from public.admins where user_id = auth.uid())
  )
  with check (
    empresa_id in (select empresa_id from public.membros where user_id = auth.uid())
    or exists (select 1 from public.admins where user_id = auth.uid())
  );

alter table public.reboques enable row level security;
drop policy if exists "Acesso autenticado" on public.reboques;
create policy "Acesso por empresa ou admin"
  on public.reboques
  for all
  using (
    empresa_id in (select empresa_id from public.membros where user_id = auth.uid())
    or exists (select 1 from public.admins where user_id = auth.uid())
  )
  with check (
    empresa_id in (select empresa_id from public.membros where user_id = auth.uid())
    or exists (select 1 from public.admins where user_id = auth.uid())
  );

alter table public.stock_faturas enable row level security;
drop policy if exists "Acesso autenticado" on public.stock_faturas;
create policy "Acesso por empresa ou admin"
  on public.stock_faturas
  for all
  using (
    empresa_id in (select empresa_id from public.membros where user_id = auth.uid())
    or exists (select 1 from public.admins where user_id = auth.uid())
  )
  with check (
    empresa_id in (select empresa_id from public.membros where user_id = auth.uid())
    or exists (select 1 from public.admins where user_id = auth.uid())
  );

-- stock_linhas herda o âmbito da fatura (join a stock_faturas)
alter table public.stock_linhas enable row level security;
drop policy if exists "Acesso autenticado" on public.stock_linhas;
create policy "Acesso por empresa ou admin via fatura"
  on public.stock_linhas
  for all
  using (
    exists (
      select 1 from public.stock_faturas sf
      where sf.id = stock_linhas.fatura_id
        and (
          sf.empresa_id in (select empresa_id from public.membros where user_id = auth.uid())
          or exists (select 1 from public.admins where user_id = auth.uid())
        )
    )
  )
  with check (
    exists (
      select 1 from public.stock_faturas sf
      where sf.id = stock_linhas.fatura_id
        and (
          sf.empresa_id in (select empresa_id from public.membros where user_id = auth.uid())
          or exists (select 1 from public.admins where user_id = auth.uid())
        )
    )
  );

alter table public.fornecedores enable row level security;
drop policy if exists "Acesso autenticado" on public.fornecedores;
create policy "Acesso por empresa ou admin"
  on public.fornecedores
  for all
  using (
    empresa_id in (select empresa_id from public.membros where user_id = auth.uid())
    or exists (select 1 from public.admins where user_id = auth.uid())
  )
  with check (
    empresa_id in (select empresa_id from public.membros where user_id = auth.uid())
    or exists (select 1 from public.admins where user_id = auth.uid())
  );

alter table public.marcas enable row level security;
drop policy if exists "Acesso autenticado" on public.marcas;
create policy "Acesso por empresa ou admin"
  on public.marcas
  for all
  using (
    empresa_id in (select empresa_id from public.membros where user_id = auth.uid())
    or exists (select 1 from public.admins where user_id = auth.uid())
  )
  with check (
    empresa_id in (select empresa_id from public.membros where user_id = auth.uid())
    or exists (select 1 from public.admins where user_id = auth.uid())
  );

-- 9. empresas e membros — RLS de leitura própria (para a app saber a empresa do user)
alter table public.empresas enable row level security;
create policy "Ver a própria empresa"
  on public.empresas
  for select
  using (
    id in (select empresa_id from public.membros where user_id = auth.uid())
    or exists (select 1 from public.admins where user_id = auth.uid())
  );

alter table public.membros enable row level security;
create policy "Ver a própria ligação"
  on public.membros
  for select
  using (
    user_id = auth.uid()
    or exists (select 1 from public.admins where user_id = auth.uid())
  );

alter table public.admins enable row level security;
create policy "Ver o próprio estatuto de admin"
  on public.admins
  for select
  using (user_id = auth.uid());

-- ══════════════════════════════════════════════════════════════════
-- Para adicionar uma nova empresa e utilizador no futuro:
--
-- insert into public.empresas (nome) values ('Nome da Nova Empresa Lda') returning id;
-- insert into public.membros (user_id, empresa_id)
--   select id, '<id-da-empresa-devolvido-acima>' from auth.users where email = 'novo.user@empresa.pt';
-- ══════════════════════════════════════════════════════════════════
