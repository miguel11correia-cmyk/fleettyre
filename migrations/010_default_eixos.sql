-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: valor por defeito para "Nº Eixos" nos
-- registos existentes de veículos (assume 4x2) e reboques (assume
-- 2x2x2, ou seja 3 eixos de rodado simples), para não teres de
-- editar um a um. Só actualiza registos que ainda não têm o campo
-- preenchido — não sobrescreve nada já definido manualmente.
-- Corre isto no SQL Editor do Supabase DEPOIS do 009.
-- ══════════════════════════════════════════════════════════════════

update public.veiculos
set num_eixos = '4x2'
where num_eixos is null;

update public.reboques_frota
set num_eixos = '2x2x2'
where num_eixos is null;
