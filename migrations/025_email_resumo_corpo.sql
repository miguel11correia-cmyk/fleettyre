-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: guarda o resumo do corpo do email (o mesmo
-- excerto já usado no filtro de relevância), para o utilizador poder
-- ler mais contexto na página "Faturas por email" sem ter de ir ao
-- próprio email. Corre isto no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════

alter table public.emails_fornecedores_pendentes
  add column if not exists resumo_corpo text;
