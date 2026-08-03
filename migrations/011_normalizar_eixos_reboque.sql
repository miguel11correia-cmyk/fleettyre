-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: normalizar valores antigos de "Eixos" nos
-- reboques (ex: "3", herdados do campo numérico antigo) para a nova
-- configuração fixa. Assume 2x2x2 (3 eixos, rodado simples), tal
-- como a migração 010. Corre isto no SQL Editor do Supabase DEPOIS
-- do 009 e do 010.
-- ══════════════════════════════════════════════════════════════════

update public.reboques_frota
set num_eixos = '2x2x2'
where num_eixos not in ('2x2', '2x2x2', '2x2x2 (rodado duplo)');
