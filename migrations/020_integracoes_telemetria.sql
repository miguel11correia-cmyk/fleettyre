-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: tabela de integrações de telemetria por
-- empresa (Cartrack e futuros fornecedores GPS), a substituir as
-- credenciais fixas nos segredos da Edge Function (que só serviam
-- para uma única empresa). Corre isto no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════

create table if not exists public.integracoes_telemetria (
  id          bigserial primary key,
  created_at  timestamptz default now(),
  empresa_id  uuid references public.empresas(id) not null,
  fornecedor  text not null,   -- 'cartrack', e futuros fornecedores
  credenciais jsonb not null,  -- forma livre, específica de cada fornecedor
  ativo       boolean default true
);

create unique index if not exists idx_integracoes_telemetria_empresa_fornecedor
  on public.integracoes_telemetria (empresa_id, fornecedor);

alter table public.integracoes_telemetria enable row level security;

-- Só admins geram/veem isto por agora — são credenciais de integração
-- (Cartrack, etc.), e ainda não há UI para a própria empresa as gerir.
drop policy if exists "Só admins" on public.integracoes_telemetria;
create policy "Só admins"
  on public.integracoes_telemetria for all
  using (exists (select 1 from public.admins where user_id = auth.uid()))
  with check (exists (select 1 from public.admins where user_id = auth.uid()));

-- ── BACKFILL ──────────────────────────────────────────────────────
-- Migra as credenciais do Cartrack que hoje estão nos segredos da
-- Edge Function (Supabase Dashboard → Edge Functions → cartrack-sync
-- → Secrets, antes de a apagares) para esta tabela. Substitui os
-- valores entre <> pelos actuais e depois descomenta e corre:
--
-- insert into public.integracoes_telemetria (empresa_id, fornecedor, credenciais)
-- values (
--   '<CARTRACK_EMPRESA_ID actual>',
--   'cartrack',
--   jsonb_build_object(
--     'username', '<CARTRACK_USERNAME actual>',
--     'password', '<CARTRACK_PASSWORD actual>',
--     'region',   '<CARTRACK_REGION actual, ex: pt>'
--   )
-- );
