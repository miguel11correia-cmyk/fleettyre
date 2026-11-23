-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: permite várias integrações de email do MESMO
-- fornecedor por empresa (ex.: duas contas IMAP distintas, ou dois
-- Outlook distintos) — antes só era possível 1 por (empresa, fornecedor),
-- o que impedia ligar uma segunda caixa do mesmo tipo sem desligar a
-- primeira. Corre isto no SQL Editor do Supabase, depois de implantar
-- as Edge Functions actualizadas (email-status, email-sync-manual,
-- email-oauth-desligar, email-oauth-callback, email-imap-ligar).
-- ══════════════════════════════════════════════════════════════════

drop index if exists public.idx_integracoes_email_empresa_fornecedor;

-- Continua a impedir ligar a MESMA caixa duas vezes (mesma empresa +
-- fornecedor + conta), mas já não impede duas caixas distintas do
-- mesmo fornecedor. NULLS NOT DISTINCT (Postgres 15+) para contar dois
-- conta_email nulos como conflito também — sem isto, duas integrações
-- sem conta_email conhecida (caso raro, só se o adaptador OAuth não
-- devolver o email) não seriam apanhadas como duplicadas.
create unique index if not exists idx_integracoes_email_empresa_fornecedor_conta
  on public.integracoes_email (empresa_id, fornecedor, conta_email)
  nulls not distinct;
