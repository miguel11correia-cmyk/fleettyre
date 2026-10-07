-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: posição (direção/tração/reboque/misto) e
-- descrição por modelo de pneu, no catálogo e nas marcas já copiadas
-- para as empresas.
--
-- Cada marca tem vários modelos, cada um pensado para um eixo e uso
-- diferente — isto dá essa informação já pronta a quem regista um
-- pneu, em vez de só o nome do modelo sem contexto nenhum.
-- ══════════════════════════════════════════════════════════════════

alter table public.subtipos_catalogo add column if not exists posicao text;
alter table public.subtipos_catalogo add column if not exists descricao text;
alter table public.subtipos_marca   add column if not exists posicao text;
alter table public.subtipos_marca   add column if not exists descricao text;

-- Preenche o catálogo (pesquisa em catálogos oficiais/Tyrepress — ver
-- 030 para as fontes).
update public.subtipos_catalogo sc
set posicao = v.posicao, descricao = v.descricao
from (values
  ('MICHELIN','X Multi Z','Misto','Regional, versátil, grande durabilidade'),
  ('MICHELIN','X Multi D','Tração','Regional, boa tracção em piso molhado'),
  ('MICHELIN','X Multi F','Reboque','Regional, baixo desgaste'),
  ('MICHELIN','X Line Energy Z','Misto','Longo curso, baixo consumo de combustível'),
  ('MICHELIN','X Line Energy D','Tração','Longo curso, baixo consumo de combustível'),
  ('MICHELIN','X Works','Tração','Obras/piso difícil, uso misto on/off-road'),

  ('CONTINENTAL','Conti Hybrid HS5','Direção','Regional e misto, boa tracção on/off-road'),
  ('CONTINENTAL','Conti Hybrid HD5','Tração','Regional e misto, boa tracção on/off-road'),
  ('CONTINENTAL','Conti Hybrid HT5','Reboque','Regional e misto'),

  ('BRIDGESTONE','Ecopia H-Steer 001','Direção','Longo curso, baixa resistência ao rolamento'),
  ('BRIDGESTONE','Ecopia H-Drive 001','Tração','Longo curso, baixa resistência ao rolamento'),
  ('BRIDGESTONE','Ecopia H-Trailer 001','Reboque','Longo curso, baixa resistência ao rolamento'),

  ('HANKOOK','SmartFlex AL51','Misto','Regional e longo curso, alta quilometragem'),
  ('HANKOOK','SmartFlex DL51','Tração','Regional e longo curso'),
  ('HANKOOK','AH35','Misto','Regional, todas as estações'),

  ('FIRESTONE','FS400','Direção','Regional, bom custo-benefício'),
  ('FIRESTONE','FD600','Tração','Regional, bom custo-benefício'),
  ('FIRESTONE','FT500','Reboque','Regional, bom custo-benefício'),

  ('PIRELLI','FH01','Direção','Longo curso, precisão de condução'),
  ('PIRELLI','TH01','Tração','Longo curso, baixa resistência ao rolamento'),
  ('PIRELLI','TR01','Tração','Misto, boa aptidão para recauchutagem'),

  ('GOODYEAR','KMAX S','Direção','Regional/urbano, todas as estações'),
  ('GOODYEAR','KMAX D','Tração','Regional/urbano, todas as estações'),
  ('GOODYEAR','KMAX T','Reboque','Regional/urbano, todas as estações'),
  ('GOODYEAR','Marathon LHS II','Direção','Longo curso, alta quilometragem'),

  ('DUNLOP','SP344','Direção','Regional'),
  ('DUNLOP','SP346','Tração','Regional'),
  ('DUNLOP','SP482','Reboque','Longo curso'),

  ('APOLLO','EnduRace RA2','Direção','Longo curso, resistente, certificado para neve'),
  ('APOLLO','EnduRace RD2','Tração','Longo curso'),
  ('APOLLO','EnduRace RT2','Reboque','Longo curso'),
  ('APOLLO','EnduMile LHT','Reboque','Longo curso, máxima eficiência de combustível'),

  ('WEST LAKE','WSR1','Direção','Regional'),
  ('WEST LAKE','WDR1','Tração','Regional'),
  ('WEST LAKE','WTR1','Reboque','Regional'),

  ('JINYU TIRES','JF518','Direção','Baixa resistência ao rolamento, custo reduzido'),
  ('JINYU TIRES','JA626','Reboque','Uso misto on/off-road'),

  ('CHENGSHAN','TH155','Reboque','Híbrido longo curso/regional, apto para inverno'),

  ('AEROTYRE','AE01-S','Direção','Regional/longo curso'),
  ('AEROTYRE','AE01-D','Tração','Regional/longo curso'),
  ('AEROTYRE','AE01-T','Reboque','Regional/longo curso'),

  ('BARUM TYRES','BF200R','Direção','Regional/longo curso, baixo custo'),
  ('BARUM TYRES','BD200R','Tração','Regional/longo curso, baixo custo'),
  ('BARUM TYRES','BD300R','Tração','Alta quilometragem, boa aderência em piso molhado'),

  ('AUSTONE','ADR606','Tração','Regional, boa aderência em piso molhado e neve'),

  ('AEOLUS','Neo Allroads S','Direção','Regional, uso misto on/off-road'),
  ('AEOLUS','Neo Allroads D','Tração','Regional, uso misto on/off-road'),
  ('AEOLUS','ASR69','Direção','Regional'),
  ('AEOLUS','ADR69','Tração','Regional'),

  ('SAVA','Avant 5','Direção','Regional/longo curso/urbano, resistente a cortes'),
  ('SAVA','Orjak 5','Tração','Regional/longo curso/urbano'),
  ('SAVA','Cargo 5','Reboque','Regional/longo curso/urbano'),

  ('DOUBLE COIN','RR700','Misto','Regional, todas as posições'),
  ('DOUBLE COIN','RR208','Direção','Regional/reboque'),
  ('DOUBLE COIN','RR99','Misto','Uso misto on/off-road'),

  ('SAILUN','S606','Direção','Alta quilometragem, todas as estações'),
  ('SAILUN','S637','Misto','Regional'),
  ('SAILUN','STL1','Reboque','Longo curso, baixa resistência ao rolamento')
) as v(marca_nome, modelo_nome, posicao, descricao)
join public.marcas_catalogo mc on mc.nome = v.marca_nome
where sc.marca_catalogo_id = mc.id and sc.nome = v.modelo_nome;

-- Trigger actualizado: copia também posição/descrição ao popular os
-- modelos de uma empresa nova.
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
  insert into public.subtipos_marca (empresa_id, marca_id, nome, posicao, descricao)
  select new.id, nm.id, sc.nome, sc.posicao, sc.descricao
  from novas_marcas nm
  join public.marcas_catalogo mc on mc.nome = nm.nome
  join public.subtipos_catalogo sc on sc.marca_catalogo_id = mc.id
  on conflict do nothing;
  return new;
end;
$$;

-- Backfill: enriquece os modelos já copiados para empresas existentes
-- (pela migration 030) com a posição/descrição agora disponível no
-- catálogo — só onde ainda não há posição definida, para nunca
-- substituir algo que o utilizador já tenha editado à mão.
update public.subtipos_marca sm
set posicao = sc.posicao, descricao = sc.descricao
from public.marcas m
join public.marcas_catalogo mc on upper(mc.nome) = upper(m.nome)
join public.subtipos_catalogo sc on sc.marca_catalogo_id = mc.id
where sm.marca_id = m.id and upper(sc.nome) = upper(sm.nome) and sm.posicao is null;

-- Para verificar:
-- select nome, posicao, descricao from subtipos_marca where marca_id = (select id from marcas where nome = 'MICHELIN' and empresa_id = '<id-da-empresa>');
