-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: "Nº Eixos" dos reboques passa de número
-- livre a configuração fixa (2x2 / 2x2x2 / 2x2x2 (rodado duplo)).
-- Corre isto no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════

alter table public.reboques_frota alter column num_eixos type text using num_eixos::text;
