-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: normalizar posicao para "Direção"/"Tração"
-- Baseado no levantamento actual:
--   TRAÇÃO (236), FRENTE (130), TRAS (30), TRÁS (2), DIREÇÃO (2)
-- Corre isto no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════

-- 1. Normalizar valores existentes
update public.pneus set posicao = 'Direção' where posicao in ('FRENTE', 'DIREÇÃO');
update public.pneus set posicao = 'Tração'  where posicao in ('TRAÇÃO', 'TRAS', 'TRÁS');

-- 2. Confirmar que só sobram 'Direção', 'Tração' ou nulo — corre isto e verifica antes do passo 3
select posicao, count(*) from public.pneus group by posicao order by count(*) desc;

-- 3. Bloquear valores fora destes dois daqui para a frente
alter table public.pneus drop constraint if exists pneus_posicao_check;
alter table public.pneus add constraint pneus_posicao_check
  check (posicao is null or posicao in ('Direção', 'Tração'));
