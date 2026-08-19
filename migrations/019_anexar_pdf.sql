-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Migração: anexar PDF de fatura aos registos
-- Corre isto no SQL Editor do Supabase.
--
-- Cria um bucket de Storage PRIVADO ("faturas-pdf") — os ficheiros não
-- ficam públicos por defeito; só são acessíveis via URL assinado,
-- gerado na hora pela app, e só para quem pertence à empresa dona do
-- registo (mesma lógica de "Acesso por empresa ou admin" usada nas
-- restantes tabelas).
--
-- Estrutura do caminho de cada ficheiro: {empresa_id}/{ficheiro}.pdf
--
-- Usado em 3 sítios da app: registos (Por matrícula), faturas de
-- stock, e pneus em armazém a aguardar oficina (que são só linhas de
-- "pneus"/"reboques" ainda não montadas de novo — por isso não
-- precisam de coluna própria).
-- ══════════════════════════════════════════════════════════════════

-- 1. COLUNAS NOVAS — caminho do ficheiro no bucket (null = sem PDF anexado)
alter table public.stock_faturas add column if not exists pdf_path text;
alter table public.pneus         add column if not exists pdf_path text;
alter table public.reboques      add column if not exists pdf_path text;

-- 2. BUCKET DE STORAGE (privado)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('faturas-pdf', 'faturas-pdf', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  file_size_limit    = 10485760,
  allowed_mime_types = array['application/pdf'];

-- 3. POLÍTICAS DE ACESSO AO BUCKET — mesma lógica de "empresa ou admin",
--    lendo o empresa_id a partir do 1º segmento do caminho do ficheiro.
drop policy if exists "Faturas PDF — acesso por empresa ou admin" on storage.objects;
create policy "Faturas PDF — acesso por empresa ou admin"
  on storage.objects
  for all
  using (
    bucket_id = 'faturas-pdf'
    and (
      (storage.foldername(name))[1]::uuid in (select empresa_id from public.membros where user_id = auth.uid())
      or exists (select 1 from public.admins where user_id = auth.uid())
    )
  )
  with check (
    bucket_id = 'faturas-pdf'
    and (
      (storage.foldername(name))[1]::uuid in (select empresa_id from public.membros where user_id = auth.uid())
      or exists (select 1 from public.admins where user_id = auth.uid())
    )
  );
