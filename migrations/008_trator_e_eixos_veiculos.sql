-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: renomear "Tractor" para "Trator" e mudar
-- "Nº Eixos" de veículos para configuração fixa (4x2/6x2 Pusher/6x2
-- Tag/Outro) em vez de número livre. Corre isto no SQL Editor do
-- Supabase.
-- ══════════════════════════════════════════════════════════════════

-- 1. Corrigir registos existentes com o tipo antigo "Tractor"
update public.veiculos set tipo = 'Trator' where tipo = 'Tractor';

-- 2. Mudar num_eixos de integer para text (passa a guardar a
--    configuração, ex: "4x2", "6x2 Pusher", "6x2 Tag", "Outro")
alter table public.veiculos alter column num_eixos type text using num_eixos::text;
