-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: catálogo global de modelos (antigo "subtipo")
-- por marca de pneu.
--
-- Mesma lógica do catálogo de marcas (029): `subtipos_catalogo` guarda
-- os modelos mais comuns de pesados por marca, partilhado por todas as
-- empresas (leitura geral, escrita só admin). Marcas sem modelos
-- verificados com confiança (Agate, Hubtrac, Matoro, Casumina) ficam
-- de fora — continua a dar para as empresas acrescentarem à mão.
--
-- O trigger de `empresas` (de 029) passa a popular também
-- `subtipos_marca` para cada marca nova, e um backfill acrescenta os
-- modelos em falta às marcas já existentes (por nome, sem duplicar).
-- ══════════════════════════════════════════════════════════════════

create table if not exists public.subtipos_catalogo (
  id uuid primary key default gen_random_uuid(),
  marca_catalogo_id uuid not null references public.marcas_catalogo(id) on delete cascade,
  nome text not null,
  unique (marca_catalogo_id, nome)
);

alter table public.subtipos_catalogo enable row level security;

drop policy if exists "Leitura autenticada" on public.subtipos_catalogo;
create policy "Leitura autenticada"
  on public.subtipos_catalogo
  for select
  to authenticated
  using (true);

drop policy if exists "Escrita só admin" on public.subtipos_catalogo;
create policy "Escrita só admin"
  on public.subtipos_catalogo
  for all
  to authenticated
  using (exists (select 1 from public.admins where user_id = auth.uid()))
  with check (exists (select 1 from public.admins where user_id = auth.uid()));

insert into public.subtipos_catalogo (marca_catalogo_id, nome)
select mc.id, v.nome
from public.marcas_catalogo mc
join (values
  ('MICHELIN','X Multi Z'), ('MICHELIN','X Multi D'), ('MICHELIN','X Multi F'),
  ('MICHELIN','X Line Energy Z'), ('MICHELIN','X Line Energy D'), ('MICHELIN','X Works'),

  ('CONTINENTAL','Conti Hybrid HS5'), ('CONTINENTAL','Conti Hybrid HD5'), ('CONTINENTAL','Conti Hybrid HT5'),

  ('BRIDGESTONE','Ecopia H-Steer 001'), ('BRIDGESTONE','Ecopia H-Drive 001'), ('BRIDGESTONE','Ecopia H-Trailer 001'),

  ('HANKOOK','SmartFlex AL51'), ('HANKOOK','SmartFlex DL51'), ('HANKOOK','AH35'),

  ('FIRESTONE','FS400'), ('FIRESTONE','FD600'), ('FIRESTONE','FT500'),

  ('PIRELLI','FH01'), ('PIRELLI','TH01'), ('PIRELLI','TR01'),

  ('GOODYEAR','KMAX S'), ('GOODYEAR','KMAX D'), ('GOODYEAR','KMAX T'), ('GOODYEAR','Marathon LHS II'),

  ('DUNLOP','SP344'), ('DUNLOP','SP346'), ('DUNLOP','SP482'),

  ('APOLLO','EnduRace RA2'), ('APOLLO','EnduRace RD2'), ('APOLLO','EnduRace RT2'), ('APOLLO','EnduMile LHT'),

  ('WEST LAKE','WSR1'), ('WEST LAKE','WDR1'), ('WEST LAKE','WTR1'),

  ('JINYU TIRES','JF518'), ('JINYU TIRES','JA626'),

  ('CHENGSHAN','TH155'),

  ('AEROTYRE','AE01-S'), ('AEROTYRE','AE01-D'), ('AEROTYRE','AE01-T'),

  ('BARUM TYRES','BF200R'), ('BARUM TYRES','BD200R'), ('BARUM TYRES','BD300R'),

  ('AUSTONE','ADR606'),

  ('AEOLUS','Neo Allroads S'), ('AEOLUS','Neo Allroads D'), ('AEOLUS','ASR69'), ('AEOLUS','ADR69'),

  ('SAVA','Avant 5'), ('SAVA','Orjak 5'), ('SAVA','Cargo 5'),

  ('DOUBLE COIN','RR700'), ('DOUBLE COIN','RR208'), ('DOUBLE COIN','RR99'),

  ('SAILUN','S606'), ('SAILUN','S637'), ('SAILUN','STL1')
) as v(marca_nome, nome) on v.marca_nome = mc.nome
on conflict (marca_catalogo_id, nome) do nothing;

-- Trigger actualizado: além das marcas, popula também os modelos de
-- cada marca nova (via subtipos_catalogo), para uma empresa nova já
-- nascer com tudo preenchido.
create or replace function public.popular_marcas_da_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  with novas_marcas as (
    insert into public.marcas (empresa_id, codigo, nome)
    select new.id, lpad(row_number() over (order by nome)::text, 2, '0'), nome
    from public.marcas_catalogo
    order by nome
    on conflict do nothing
    returning id, nome
  )
  insert into public.subtipos_marca (empresa_id, marca_id, nome)
  select new.id, nm.id, sc.nome
  from novas_marcas nm
  join public.marcas_catalogo mc on mc.nome = nm.nome
  join public.subtipos_catalogo sc on sc.marca_catalogo_id = mc.id
  on conflict do nothing;
  return new;
end;
$$;

-- Backfill: marcas já existentes (em qualquer empresa) ganham os
-- modelos do catálogo que ainda não tenham, comparando por nome para
-- não duplicar modelos já registados à mão.
insert into public.subtipos_marca (empresa_id, marca_id, nome)
select m.empresa_id, m.id, sc.nome
from public.marcas m
join public.marcas_catalogo mc on upper(mc.nome) = upper(m.nome)
join public.subtipos_catalogo sc on sc.marca_catalogo_id = mc.id
where not exists (
  select 1 from public.subtipos_marca sm
  where sm.marca_id = m.id and upper(sm.nome) = upper(sc.nome)
);

-- Para verificar:
-- select mc.nome as marca, sc.nome as modelo from subtipos_catalogo sc join marcas_catalogo mc on mc.id = sc.marca_catalogo_id order by marca, modelo;
