-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Correção: já correste a 017_lugares_fixos.sql com os
-- nomes completos (Esquerda/Direita/Interior/Exterior) antes de os
-- termos abreviado no código (Esq/Drt/Int/Ext). Isto só corrige os
-- valores já gravados para ficarem consistentes com os novos registos.
-- Corre isto no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════

update public.pneus
set posicao = replace(replace(replace(replace(posicao, 'Esquerda', 'Esq'), 'Direita', 'Drt'), 'Interior', 'Int'), 'Exterior', 'Ext')
where posicao ~ 'Esquerda|Direita|Interior|Exterior';

update public.reboques
set posicao = replace(replace(replace(replace(posicao, 'Esquerda', 'Esq'), 'Direita', 'Drt'), 'Interior', 'Int'), 'Exterior', 'Ext')
where posicao ~ 'Esquerda|Direita|Interior|Exterior';
