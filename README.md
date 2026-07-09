# FleetTyre — Gestão de Pneus para Frotas Pesadas

App web gratuita para gerir montagens e desmontagens de pneus em camiões pesados.

---

## Ficheiros

```
index.html        — estrutura da app
style.css         — estilos
app.js            — toda a lógica (auth, dados, gráficos)
supabase_setup.sql — script para criar a base de dados
```

---

## Instalação passo a passo (30 minutos, tudo gratuito)

### PASSO 1 — Criar conta Supabase (base de dados)

1. Vai a **https://supabase.com** e clica "Start for free"
2. Cria conta com GitHub ou email
3. Clica "New project"
   - Nome: `fleettyre`
   - Password: escolhe uma segura (guarda-a)
   - Region: `West EU (Ireland)` — mais perto de Portugal
4. Aguarda 1-2 minutos enquanto o projecto cria
5. No painel do projecto vai a **Settings → API**
   - Copia o **Project URL** (ex: `https://abcdefgh.supabase.co`)
   - Copia a **anon public** key (começa por `eyJhbGci...`)

### PASSO 2 — Configurar a base de dados

1. No painel Supabase vai a **SQL Editor**
2. Clica "New query"
3. Abre o ficheiro `supabase_setup.sql` deste projecto
4. Copia todo o conteúdo e cola no SQL Editor
5. Clica "Run" — deves ver "Success"

### PASSO 3 — Criar o teu utilizador

1. No painel Supabase vai a **Authentication → Users**
2. Clica "Invite user" (ou "Add user")
3. Insere o teu email e uma password segura
4. Confirma o email se pedido

### PASSO 4 — Ligar o código ao Supabase

1. Abre o ficheiro **app.js**
2. No topo encontras estas duas linhas:
   ```javascript
   const SUPABASE_URL = 'https://XXXXXXXXXXXXX.supabase.co';
   const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.XXXXX';
   ```
3. Substitui pelos valores que copiaste no Passo 1
4. Guarda o ficheiro

### PASSO 5 — Publicar no GitHub Pages

1. Vai a **https://github.com** e cria conta gratuita
2. Clica "+" → "New repository"
   - Nome: `fleettyre`
   - Visibilidade: **Public** (obrigatório para GitHub Pages gratuito)
   - Clica "Create repository"
3. Na página do repositório clica "uploading an existing file"
4. Arrasta os 4 ficheiros: `index.html`, `style.css`, `app.js`, `supabase_setup.sql`
5. Clica "Commit changes"
6. Vai a **Settings → Pages**
   - Source: "Deploy from a branch"
   - Branch: `main` / `(root)`
   - Clica "Save"
7. Aguarda 1-2 minutos e o teu URL aparece:
   `https://SEU_UTILIZADOR.github.io/fleettyre`

---

## Importar dados do Excel

Tens duas opções:

### Opção A — SQL directo (recomendado para muitos registos)

No SQL Editor do Supabase, copia e cola um insert por linha:

```sql
insert into public.pneus
  (matricula, mes_mont, kms_mont, posicao, marca, medida, tipo, fornecedor,
   mes_desmont, kms_desmont, escultura_final, destino, custo_pneu, custo_mo)
values
  ('51-PQ-43', '2021-03', 1185476, 'TRAS ESQ DENTRO', 'MICHELIN', '315/80',
   'Novo', 'JOSE LOURENCO', '2026-05', 1578691, 2, 'Remix', null, null),
  ('66-SJ-46', '2023-08', 1178000, 'FRENTE', 'HANKOOK', '315/80',
   'Novo', 'FIX N GO', '2026-03', 1385000, 0, 'Lixo', null, null);
```

### Opção B — Pelo formulário da app

Vai a "Registar pneu" e introduz manualmente. Para desmontagens já existentes,
regista a montagem primeiro e depois usa o botão "Desmontar" na ficha da matrícula.

---

## Como usar

| Secção | O que faz |
|---|---|
| Dashboard | Visão geral da frota — KPIs, gráficos por tipo/marca/fornecedor |
| Registar pneu | Formulário para nova montagem |
| Por matrícula | Historial completo de um veículo + botão "Desmontar" em cada pneu activo |
| Alertas | Pneus com escultura ≤ 3mm + tabela de taxas de desgaste calculadas |
| Fornecedores | Volume, custos e médias por fornecedor (dinâmico) |
| Marcas | Desempenho por marca: KMs médios, taxa de desgaste, custo médio |

---

## Cálculos

### KMs efectuados
```
KMs efectuados = KMs desmontagem − KMs montagem
```
Só calculado quando ambos os campos estão preenchidos e KMs desmont. > KMs mont.

### Custo médio por pneu
```
Custo médio = Soma dos custos de pneu ÷ Nº de pneus com custo preenchido
```
Nunca divide por zero — só conta registos com valor.

### Custo por km
```
€/km = Custo médio por pneu ÷ KMs médios por pneu
```
Só calculado quando ambos os valores estão disponíveis.

### Taxa de desgaste
```
Taxa (mm/1000km) = (Escultura inicial − Escultura final) ÷ KMs efectuados × 1000
```
Escultura inicial assumida: 16mm (Novo), 14mm (Remix), 12mm (Piso Aberto).
Só calculada para registos com escultura final entre 0 e 20mm.

---

## Segurança

- Login com email/password obrigatório
- Row Level Security activo — dados só acessíveis com sessão autenticada
- Sem dados expostos publicamente
- HTTPS em todos os pedidos (Supabase + GitHub Pages)
