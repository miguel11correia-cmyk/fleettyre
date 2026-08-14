-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: lugares fixos por eixo (posição granular:
-- eixo/categoria + lado + interior/exterior) em "Por matrícula" e
-- "Por reboque". Corre isto no SQL Editor do Supabase.
--
-- 1. Adiciona reboques.posicao (só tinham eixo inteiro até agora).
-- 2. Remove a constraint antiga que só permitia posicao 'Direção'/
--    'Tração' em pneus — os lugares granulares (ex: "Tração Esquerda
--    Interior") deixam de caber nessa lista fixa. A validação de
--    valores passa a ser feita pela app (só oferece lugares válidos).
-- 3. Backfill automático dos pneus/reboques ACTIVOS cuja configuração
--    de eixos é conhecida: distribui os que hoje partilham a mesma
--    categoria (ex: 4 pneus "Tração" de um 4x2) pelos lugares fixos
--    dessa categoria, por ordem de mês de montagem/id — assume-se que
--    pneus do mesmo eixo são intercambiáveis. Pneus a mais para os
--    lugares disponíveis (ou de veículos "6x2 Pusher"/"6x2 Tag" cuja
--    posição antiga "Tração" não distingue Pusher/Tag/Tração) ficam
--    como estavam — aparecem em "Por matrícula" como lugar não
--    reconhecido, para correção manual pontual.
-- ══════════════════════════════════════════════════════════════════

alter table public.reboques add column if not exists posicao text;

alter table public.pneus drop constraint if exists pneus_posicao_check;

-- ── Mapas fixos config → categoria → lugar (mesma ordem de js/utils.js) ──

create temporary table _slot_map_veiculo (num_eixos text, categoria text, idx int, lugar text);
insert into _slot_map_veiculo (num_eixos, categoria, idx, lugar) values
  ('4x2', 'Direção', 1, 'Direção Esq'),
  ('4x2', 'Direção', 2, 'Direção Drt'),
  ('4x2', 'Tração',  1, 'Tração Esq Int'),
  ('4x2', 'Tração',  2, 'Tração Esq Ext'),
  ('4x2', 'Tração',  3, 'Tração Drt Int'),
  ('4x2', 'Tração',  4, 'Tração Drt Ext'),
  ('6x2 Pusher', 'Direção', 1, 'Direção Esq'),
  ('6x2 Pusher', 'Direção', 2, 'Direção Drt'),
  ('6x2 Pusher', 'Tração',  1, 'Tração Esq Int'),
  ('6x2 Pusher', 'Tração',  2, 'Tração Esq Ext'),
  ('6x2 Pusher', 'Tração',  3, 'Tração Drt Int'),
  ('6x2 Pusher', 'Tração',  4, 'Tração Drt Ext'),
  ('6x2 Tag', 'Direção', 1, 'Direção Esq'),
  ('6x2 Tag', 'Direção', 2, 'Direção Drt'),
  ('6x2 Tag', 'Tração',  1, 'Tração Esq Int'),
  ('6x2 Tag', 'Tração',  2, 'Tração Esq Ext'),
  ('6x2 Tag', 'Tração',  3, 'Tração Drt Int'),
  ('6x2 Tag', 'Tração',  4, 'Tração Drt Ext');

create temporary table _slot_map_reboque (num_eixos text, categoria text, idx int, lugar text);
insert into _slot_map_reboque (num_eixos, categoria, idx, lugar) values
  ('2x2', 'Eixo 1', 1, 'Eixo 1 Esq'),
  ('2x2', 'Eixo 1', 2, 'Eixo 1 Drt'),
  ('2x2', 'Eixo 2', 1, 'Eixo 2 Esq'),
  ('2x2', 'Eixo 2', 2, 'Eixo 2 Drt'),
  ('2x2x2', 'Eixo 1', 1, 'Eixo 1 Esq'),
  ('2x2x2', 'Eixo 1', 2, 'Eixo 1 Drt'),
  ('2x2x2', 'Eixo 2', 1, 'Eixo 2 Esq'),
  ('2x2x2', 'Eixo 2', 2, 'Eixo 2 Drt'),
  ('2x2x2', 'Eixo 3', 1, 'Eixo 3 Esq'),
  ('2x2x2', 'Eixo 3', 2, 'Eixo 3 Drt'),
  ('2x2x2 (rodado duplo)', 'Eixo 1', 1, 'Eixo 1 Esq Int'),
  ('2x2x2 (rodado duplo)', 'Eixo 1', 2, 'Eixo 1 Esq Ext'),
  ('2x2x2 (rodado duplo)', 'Eixo 1', 3, 'Eixo 1 Drt Int'),
  ('2x2x2 (rodado duplo)', 'Eixo 1', 4, 'Eixo 1 Drt Ext'),
  ('2x2x2 (rodado duplo)', 'Eixo 2', 1, 'Eixo 2 Esq Int'),
  ('2x2x2 (rodado duplo)', 'Eixo 2', 2, 'Eixo 2 Esq Ext'),
  ('2x2x2 (rodado duplo)', 'Eixo 2', 3, 'Eixo 2 Drt Int'),
  ('2x2x2 (rodado duplo)', 'Eixo 2', 4, 'Eixo 2 Drt Ext'),
  ('2x2x2 (rodado duplo)', 'Eixo 3', 1, 'Eixo 3 Esq Int'),
  ('2x2x2 (rodado duplo)', 'Eixo 3', 2, 'Eixo 3 Esq Ext'),
  ('2x2x2 (rodado duplo)', 'Eixo 3', 3, 'Eixo 3 Drt Int'),
  ('2x2x2 (rodado duplo)', 'Eixo 3', 4, 'Eixo 3 Drt Ext');

-- ── Backfill pneus (veículos) ──

with numerados as (
  select p.id, p.posicao as categoria, v.num_eixos,
         row_number() over (
           partition by p.matricula, p.empresa_id, p.posicao
           order by p.mes_mont nulls last, p.id
         ) as idx
  from public.pneus p
  join public.veiculos v on v.matricula = p.matricula and v.empresa_id = p.empresa_id
  where p.mes_desmont is null
    and p.posicao in ('Direção', 'Tração')
    and v.num_eixos in ('4x2', '6x2 Pusher', '6x2 Tag')
),
mapeados as (
  select n.id, m.lugar
  from numerados n
  join _slot_map_veiculo m
    on m.num_eixos = n.num_eixos and m.categoria = n.categoria and m.idx = n.idx
)
update public.pneus p
set posicao = mapeados.lugar
from mapeados
where p.id = mapeados.id;

-- ── Backfill reboques ──

with numerados as (
  select r.id, ('Eixo ' || r.eixo) as categoria, rf.num_eixos,
         row_number() over (
           partition by r.matricula, r.empresa_id, r.eixo
           order by r.mes_mont nulls last, r.id
         ) as idx
  from public.reboques r
  join public.reboques_frota rf on rf.matricula = r.matricula and rf.empresa_id = r.empresa_id
  where r.mes_desmont is null
    and r.eixo is not null
    and rf.num_eixos in ('2x2', '2x2x2', '2x2x2 (rodado duplo)')
),
mapeados as (
  select n.id, m.lugar
  from numerados n
  join _slot_map_reboque m
    on m.num_eixos = n.num_eixos and m.categoria = n.categoria and m.idx = n.idx
)
update public.reboques r
set posicao = mapeados.lugar
from mapeados
where r.id = mapeados.id;
