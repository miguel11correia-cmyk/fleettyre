-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: catálogo global de marcas de pneus.
--
-- Até agora cada empresa começava com a tabela `marcas` vazia e tinha
-- de registar cada marca à mão. Isto cria um catálogo partilhado
-- (`marcas_catalogo`, só leitura para empresas, escrita só para
-- admins) com as marcas mais comuns em frotas pesadas no mercado
-- nacional, e garante que:
--   1. Toda a empresa NOVA nasce já com a tabela `marcas` preenchida
--      a partir do catálogo (trigger em `empresas`).
--   2. As empresas que já existem (ex: Transaura) ganham agora as
--      marcas do catálogo que ainda não tinham registadas (backfill,
--      comparado por nome para não duplicar).
-- Continua a ser possível apagar/renomear/acrescentar marcas à mão
-- por empresa, exactamente como antes — o catálogo é só o ponto de
-- partida, não substitui a tabela `marcas` existente.
-- ══════════════════════════════════════════════════════════════════

create table if not exists public.marcas_catalogo (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  criado_em timestamptz not null default now()
);

alter table public.marcas_catalogo enable row level security;

drop policy if exists "Leitura autenticada" on public.marcas_catalogo;
create policy "Leitura autenticada"
  on public.marcas_catalogo
  for select
  to authenticated
  using (true);

drop policy if exists "Escrita só admin" on public.marcas_catalogo;
create policy "Escrita só admin"
  on public.marcas_catalogo
  for all
  to authenticated
  using (exists (select 1 from public.admins where user_id = auth.uid()))
  with check (exists (select 1 from public.admins where user_id = auth.uid()));

insert into public.marcas_catalogo (nome) values
  ('MICHELIN'), ('CONTINENTAL'), ('HANKOOK'), ('BRIDGESTONE'), ('FIRESTONE'),
  ('PIRELLI'), ('APOLLO'), ('HUBTRAC'), ('AGATE'), ('WEST LAKE'), ('JINYU TIRES'),
  ('MATORO'), ('CHENGSHAN'), ('CASUMINA'), ('AEROTYRE'), ('BARUM TYRES'),
  ('AUSTONE'), ('AEOLUS'), ('GOODYEAR'), ('DUNLOP'), ('SAVA'), ('DOUBLE COIN'),
  ('SAILUN')
on conflict (nome) do nothing;

-- Preenche a tabela `marcas` de uma empresa nova com o catálogo
-- inteiro, continuando a numeração de código a partir de "01" (mesma
-- lógica do botão "Adicionar" em js/marcas.js).
create or replace function public.popular_marcas_da_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.marcas (empresa_id, codigo, nome)
  select new.id, lpad(row_number() over (order by nome)::text, 2, '0'), nome
  from public.marcas_catalogo
  order by nome
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_popular_marcas on public.empresas;
create trigger trg_popular_marcas
  after insert on public.empresas
  for each row
  execute function public.popular_marcas_da_empresa();

-- Backfill para empresas já existentes — só acrescenta as marcas do
-- catálogo que a empresa ainda não tenha (por nome, sem distinguir
-- maiúsculas/minúsculas), continuando a numeração de código a partir
-- do maior código já usado por essa empresa.
insert into public.marcas (empresa_id, codigo, nome)
select e.id,
       lpad((
         coalesce((select max(m2.codigo::int) from public.marcas m2 where m2.empresa_id = e.id), 0)
         + row_number() over (partition by e.id order by mc.nome)
       )::text, 2, '0'),
       mc.nome
from public.empresas e
cross join public.marcas_catalogo mc
where not exists (
  select 1 from public.marcas m
  where m.empresa_id = e.id and upper(m.nome) = upper(mc.nome)
);

-- Para verificar:
-- select codigo, nome from public.marcas where empresa_id = '<id-da-empresa>' order by codigo;
