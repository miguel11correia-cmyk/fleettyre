-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: integrações de email por empresa (Outlook e
-- futuros fornecedores), para o staging de emails de fornecedores de
-- pneus (facturas). Corre isto no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════

-- 1. Integrações de email (credenciais/tokens — só-admin, mesmo padrão
--    de integracoes_telemetria).
create table if not exists public.integracoes_email (
  id                   bigserial primary key,
  created_at           timestamptz default now(),
  empresa_id           uuid references public.empresas(id) not null,
  fornecedor           text not null,   -- 'outlook', e futuros ('gmail', ...)
  conta_email          text,
  tokens               jsonb not null,  -- {access_token, refresh_token, expires_at}
  ativo                boolean default true,
  ultima_sincronizacao timestamptz
);

create unique index if not exists idx_integracoes_email_empresa_fornecedor
  on public.integracoes_email (empresa_id, fornecedor);

alter table public.integracoes_email enable row level security;

drop policy if exists "Só admins" on public.integracoes_email;
create policy "Só admins"
  on public.integracoes_email for all
  using (exists (select 1 from public.admins where user_id = auth.uid()))
  with check (exists (select 1 from public.admins where user_id = auth.uid()));

-- 2. Emails de fornecedores identificados como possíveis facturas,
--    ainda por processar manualmente (RLS normal — não guarda segredos).
create table if not exists public.emails_fornecedores_pendentes (
  id             bigserial primary key,
  created_at     timestamptz default now(),
  empresa_id     uuid references public.empresas(id) not null,
  integracao_id  bigint references public.integracoes_email(id),
  mensagem_id    text not null,  -- internetMessageId (estável entre pastas)
  remetente      text,
  assunto        text,
  data_recebido  timestamptz,
  pdf_path       text,
  estado         text default 'pendente'  -- 'pendente' | 'arquivado'
);

create unique index if not exists idx_emails_forn_pendentes_empresa_mensagem
  on public.emails_fornecedores_pendentes (empresa_id, mensagem_id);

alter table public.emails_fornecedores_pendentes enable row level security;

drop policy if exists "Acesso por empresa ou admin" on public.emails_fornecedores_pendentes;
create policy "Acesso por empresa ou admin"
  on public.emails_fornecedores_pendentes for all
  using (
    empresa_id in (select empresa_id from public.membros where user_id = auth.uid())
    or exists (select 1 from public.admins where user_id = auth.uid())
  )
  with check (
    empresa_id in (select empresa_id from public.membros where user_id = auth.uid())
    or exists (select 1 from public.admins where user_id = auth.uid())
  );

-- 3. Domínio de email do fornecedor (opcional) — melhora a precisão do
--    filtro de sincronização quando preenchido; sem isso o filtro usa
--    só palavras-chave no assunto.
alter table public.fornecedores add column if not exists dominio_email text;
