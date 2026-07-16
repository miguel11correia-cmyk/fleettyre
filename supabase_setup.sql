-- ══════════════════════════════════════════════════════════════════
-- FleetTyre — Script de configuração da base de dados no Supabase
-- Copia e cola isto no SQL Editor do teu projecto Supabase
-- ══════════════════════════════════════════════════════════════════

-- 1. CRIAR TABELA PRINCIPAL
create table if not exists public.pneus (
  id              bigserial primary key,
  created_at      timestamptz default now(),

  -- Identificação
  matricula       text not null,
  mat_pneu        text,           -- matrícula do pneu (opcional)

  -- Montagem
  mes_mont        text not null,  -- formato AAAA-MM
  kms_mont        integer not null check (kms_mont > 0),
  posicao         text,
  marca           text,
  medida          text,
  tipo            text check (tipo in ('Novo', 'Remix', 'Piso Aberto', 'Rechapado')),
  fornecedor      text,

  -- Desmontagem (preenchido depois)
  mes_desmont     text,           -- formato AAAA-MM
  kms_desmont     integer check (kms_desmont is null or kms_desmont > 0),
  escultura_final numeric(4,1) check (escultura_final is null or (escultura_final >= 0 and escultura_final <= 25)),
  destino         text,

  -- Custos
  custo_pneu      numeric(8,2) check (custo_pneu is null or custo_pneu >= 0),
  custo_mo        numeric(8,2) check (custo_mo   is null or custo_mo   >= 0),
  custo_total     numeric(8,2) generated always as (
    coalesce(custo_pneu, 0) + coalesce(custo_mo, 0)
  ) stored,

  -- Validação: kms desmontagem > kms montagem
  constraint kms_desmont_maior_mont check (
    kms_desmont is null or kms_desmont > kms_mont
  )
);

-- 2. ÍNDICES para pesquisas rápidas
create index if not exists idx_pneus_matricula  on public.pneus (matricula);
create index if not exists idx_pneus_mes_mont   on public.pneus (mes_mont);
create index if not exists idx_pneus_fornecedor on public.pneus (fornecedor);
create index if not exists idx_pneus_marca      on public.pneus (marca);

-- 3. ROW LEVEL SECURITY — só o utilizador autenticado acede aos seus dados
alter table public.pneus enable row level security;

-- Política: utilizador autenticado pode ver e editar todos os registos
-- (num sistema multi-utilizador poderias filtrar por user_id, mas aqui é uso individual)
create policy "Acesso autenticado"
  on public.pneus
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 4. IMPORTAR DADOS EXISTENTES DO EXCEL
-- Cola abaixo os teus registos existentes, um por linha:
-- insert into public.pneus (matricula, mes_mont, kms_mont, posicao, marca, medida, tipo, fornecedor, mes_desmont, kms_desmont, escultura_final, destino, custo_pneu, custo_mo)
-- values
--   ('51-PQ-43', '2021-03', 1185476, 'TRAS ESQ DENTRO', 'MICHELIN', '315/80', 'Novo', 'JOSE LOURENCO', '2026-05', 1578691, 2, 'Remix', null, null),
--   ('51-PQ-43', '2021-03', 1185476, 'TRAS ESQ FORA',   'MICHELIN', '315/80', 'Novo', 'JOSE LOURENCO', '2026-05', 1578691, 2, 'Remix', null, null),
-- ... etc

-- 5. CRIAR UTILIZADOR
-- Vai a Authentication > Users no painel Supabase e clica "Invite user"
-- Ou usa: select auth.sign_up('email@empresa.pt', 'password_segura');
