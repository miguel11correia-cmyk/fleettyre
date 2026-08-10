-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: fecha os saltos deixados na coluna `codigo`
-- da tabela `marcas` por marcas apagadas (ex: 09 → 11 → 13 passa a
-- 09 → 10 → 11). Corre isto no SQL Editor do Supabase.
--
-- Renumera cada empresa de forma independente, mantendo a ordem
-- relativa atual dos códigos. Feito em dois passos (primeiro para
-- valores temporários, depois para os finais) para nunca colidir
-- com um código já existente durante a atualização.
-- ══════════════════════════════════════════════════════════════════

with numerados as (
  select id, empresa_id,
         row_number() over (partition by empresa_id order by codigo::int) as novo_num
  from public.marcas
)
update public.marcas m
set codigo = '_tmp_' || numerados.novo_num::text
from numerados
where m.id = numerados.id;

update public.marcas
set codigo = lpad(replace(codigo, '_tmp_', ''), 2, '0');

-- Para verificar o resultado:
-- select codigo, nome from public.marcas order by empresa_id, codigo;
