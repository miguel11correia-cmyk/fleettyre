-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: um fornecedor pode usar mais do que um
-- domínio de email (às vezes há mais do que uma caixa a enviar
-- facturas). `dominio_email` (texto único) passa a `dominios_email`
-- (lista de texto). Corre isto no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════

alter table public.fornecedores
  alter column dominio_email type text[]
  using case when dominio_email is null then null else array[dominio_email] end;

alter table public.fornecedores rename column dominio_email to dominios_email;
