-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Backfill: criar ficha de frota para as matrículas já
-- existentes em pneus/reboques que ainda não têm veículo/reboque
-- registado em "Frota". Fica só a matrícula preenchida — completa
-- marca/modelo/ano/etc. depois na página "Frota".
-- Corre isto no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════

-- 1. VEÍCULOS — uma linha por matrícula distinta já usada em pneus
insert into public.veiculos (empresa_id, matricula)
select distinct empresa_id, matricula
from public.pneus
where matricula is not null
on conflict (matricula, empresa_id) do nothing;

-- 2. REBOQUES — uma linha por matrícula distinta já usada em reboques
insert into public.reboques_frota (empresa_id, matricula)
select distinct empresa_id, matricula
from public.reboques
where matricula is not null
on conflict (matricula, empresa_id) do nothing;
