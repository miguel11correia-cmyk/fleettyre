# FleetTyre — Gestão de Pneus para Frotas Pesadas

App web multi-empresa para gerir o ciclo de vida de pneus em veículos pesados e reboques: montagens, desmontagens, custos, desgaste, stock e alertas.

Produção: [fleet-tyre.com](https://fleet-tyre.com) (landing pública) · [fleet-tyre.com/app.html](https://fleet-tyre.com/app.html) (app)

---

## Stack

- **Frontend**: HTML + CSS + JavaScript vanilla, sem build step nem framework. Um `<script>` por ficheiro, carregados directamente no `app.html`.
- **Backend**: `server.js` — servidor Node (`http` nativo, sem Express) que serve ficheiros estáticos, injecta as credenciais Supabase no HTML e expõe um endpoint (`/api/contacto`) para o formulário de contacto.
- **Base de dados/auth**: Supabase (Postgres + Auth + Row Level Security + Edge Functions).
- **Email transacional**: Resend (domínio próprio `fleet-tyre.com`) — usado tanto pelo Supabase (SMTP, para reset de password) como pelo `server.js` (API directa, para o formulário de contacto).
- **Alojamento**: Railway (deploy automático a cada push/merge para `main`), DNS via Cloudflare.

---

## Estrutura de ficheiros

```
index.html                        — landing page pública (marketing + formulário de contacto)
app.html                          — shell da app: login + todas as páginas internas (SPA de facto,
                                     páginas trocadas por JS, não por navegação real)
style.css                         — estilos partilhados por app.html e index.html
server.js                         — servidor Node: ficheiros estáticos, injecção de env vars,
                                     POST /api/contacto (envia emails via Resend)
privacidade.html, termos.html     — páginas legais
manifest.json                     — PWA (start_url aponta para app.html)

js/                                — lógica da secção "Veículos" + partilhada
  config.js                        — cria o cliente Supabase (sb)
  auth.js                          — login, logout, mudar password, esqueci-me da password
  nav.js                           — troca de página dentro da app (nav/navR/navReg)
  utils.js                         — helpers partilhados: formatação, cálculos de desgaste,
                                     SLOTS_VEICULO/SLOTS_REBOQUE (lugares fixos), loading()
  frota_cadastro.js                — ficha de veículos (marca/modelo/nº eixos), lista de marcas
  frota.js                         — "Por matrícula": lugares fixos + histórico de um veículo
  registar.js                      — formulário de registo de montagem
  dashboard.js, alertas.js,
  analytics.js, marcas.js,
  fornecedores.js, stock.js        — cada página da app, um ficheiro por secção
  custom-select.js                 — substitui os <select> [data-fancy] por um combobox à parte,
                                     mantendo o <select> original escondido como fonte da verdade
  pdf-anexo.js                     — anexar/ver PDF em registos, faturas e pneus em oficina
                                     (mecanismo único partilhado pelos três contextos)

js/reboques/                       — equivalentes dos ficheiros acima, para a secção "Reboques"
                                     (frota_cadastro_r.js, frota_r.js, registar_r.js, …) — não é
                                     um espelho perfeito: fornecedores_marcas_r.js junta o que em
                                     "Veículos" são dois ficheiros separados (fornecedores.js +
                                     marcas.js)

migrations/                        — alterações à base de dados, ficheiros .sql numerados por
                                     ordem, corridos manualmente no SQL Editor do Supabase
                                     (000 = schema inicial; nunca editar um já publicado, criar
                                     sempre o próximo número)

supabase/functions/                — Edge Functions (Deno), deploy manual via Supabase CLI
  _shared/                          — código partilhado entre funções (ex: adaptadores de
                                     telemetria — ver secção própria abaixo)
  telemetria-sync/                 — sincroniza o km actual dos veículos com o(s) fornecedor(es)
                                     de telemetria configurados, uma vez por dia (pg_cron)

assets/                            — logos (app, marcas de veículos e reboques), imagens da
                                     landing page e do ecrã de login
```

---

## Modelo de dados (tabelas principais)

Multi-tenancy: quase todas as tabelas têm `empresa_id`, e o acesso é controlado por Row Level Security — cada utilizador só vê os dados da(s) empresa(s) a que pertence (tabela `membros`), excepto admins (tabela `admins`), que veem tudo.

| Tabela | O que guarda |
|---|---|
| `empresas` | Cada cliente/empresa da FleetTyre |
| `membros` | Liga utilizadores (`auth.users`) a uma empresa (1 empresa por utilizador) |
| `admins` | Utilizadores com acesso global (todas as empresas) |
| `veiculos` | Ficha de cada camião/tractor: matrícula, marca, `num_eixos` (config: 4x2/6x2 Pusher/6x2 Tag/Outro), `km_atual` (via telemetria) |
| `reboques_frota` | Ficha de cada reboque — equivalente a `veiculos`, sem `reboque_hab` |
| `pneus` | Um registo por montagem/desmontagem de pneu num **veículo** — `posicao` é o lugar fixo (ver abaixo) |
| `reboques` | Um registo por montagem/desmontagem de pneu num **reboque** — nome confuso de propósito histórico: é a tabela de *pneus de reboques*, não a ficha de reboques (essa é `reboques_frota`) |
| `marcas`, `fornecedores` | Listas geridas por empresa, usadas nos selects de marca/fornecedor em toda a app |
| `stock_faturas`, `stock_linhas` | Faturas de compra de pneus e as suas linhas, para controlo de stock |
| `integracoes_telemetria` | Credenciais por empresa + fornecedor de telemetria (ver abaixo) |

---

## Lugares fixos (posições de pneu)

Cada veículo/reboque com uma configuração de eixos conhecida (`num_eixos` não é "Outro") tem uma lista fixa de lugares (ex.: `"Tração Esq Int"`) definida em `SLOTS_VEICULO`/`SLOTS_REBOQUE` (`js/utils.js`). Em "Por matrícula"/"Por reboque", cada lugar aparece sempre — preenchido com o pneu activo desse lugar, ou vazio com um botão "+ Montar".

- **Registo**: continua a ser por categoria (Direção/Tração/Eixo N) + quantidade; a app distribui automaticamente pelos lugares livres dessa categoria, por ordem fixa.
- **Edição individual**: mostra o selector granular completo (todos os lugares livres + o lugar actual do próprio pneu), para corrigir uma posição específica.
- Veículos/reboques sem ficha, ou com configuração "Outro", mantêm uma lista solta sem lugares fixos (comportamento anterior a esta funcionalidade).

---

## Integração de telemetria (km actual)

`veiculos.km_atual`/`km_atual_em` é preenchido automaticamente (quando configurado) a partir do sistema de GPS/telemetria de cada empresa, e usado como fallback para estimar KMs percorridos quando um pneu ainda não foi desmontado. É só informativo — nunca substitui os KMs manuais dos registos de pneus.

- `integracoes_telemetria`: uma linha por empresa + fornecedor (`fornecedor` = `'cartrack'`, etc.), com `credenciais` em `jsonb` (forma livre, específica de cada fornecedor).
- `supabase/functions/telemetria-sync`: Edge Function agendada (via `pg_cron`, diariamente às 05:00 UTC) que percorre todas as integrações activas e despacha para o adaptador certo.
- Cada fornecedor é um adaptador em `supabase/functions/_shared/<fornecedor>.ts`, cumprindo o contrato `AdaptadorTelemetria` (`obterOdometro(matricula, credenciais) → { km, em } | null`). Hoje só existe `cartrack.ts`. **Adicionar um fornecedor novo = escrever um adaptador desse tamanho + inserir uma linha em `integracoes_telemetria` — não é preciso tocar em mais nada.**

---

## Email (Resend)

Domínio `fleet-tyre.com` verificado no Resend (SPF/DKIM/DMARC via Cloudflare). Dois usos distintos, ambos autenticados com a mesma API key do Resend:

1. **Supabase Auth (SMTP)** — Authentication → Emails → SMTP Settings, aponta para `smtp.resend.com` com a API key como password. Usado para o email de "Reset Password" (template em português, editado em Authentication → Emails → Templates).
2. **Formulário de contacto** (`POST /api/contacto` em `server.js`) — chama a API REST do Resend directamente (`fetch`, sem dependências). Envia uma notificação para o dono da app e uma confirmação automática (com assinatura em banner) para quem preencheu o formulário.

Variável de ambiente necessária no Railway: `RESEND_API_KEY`.

---

## Autenticação

- Login por email/password (Supabase Auth). Depois de autenticar, se o utilizador tiver acesso a mais do que uma empresa (só acontece para admins), escolhe qual quer usar; a escolha fica em `localStorage`.
- **Mudar password**: painel lateral acessível a partir do menu, para um utilizador já autenticado (`sb.auth.updateUser`).
- **Esqueci-me da password**: link no login → email com link de recuperação (`resetPasswordForEmail`) → o link traz o utilizador de volta a `app.html` com uma sessão temporária (evento `PASSWORD_RECOVERY`), que mostra um formulário de nova password antes de entrar normalmente.

---

## Fluxo de trabalho (contribuição/deploy)

- Migrações (`migrations/*.sql`) e Edge Functions (`supabase/functions/`) **não têm deploy automático** — corre-se manualmente (SQL Editor / `supabase functions deploy`) depois do merge, seguindo as instruções no topo de cada ficheiro de migração.
- Código da app (tudo o resto) faz deploy automático no Railway a cada push/merge para `main`.
- PRs abertos a partir do branch de trabalho para `main`; o merge é sempre feito manualmente no GitHub.

---

## Instalação de raiz (novo ambiente Supabase)

### 1. Criar projecto Supabase
[supabase.com](https://supabase.com) → New Project → copiar **Project URL** e a chave **anon public** (Settings → API).

### 2. Criar a base de dados
No SQL Editor: correr `migrations/000_initial_setup.sql`, depois todos os `migrations/0XX_*.sql` seguintes, **por ordem numérica**.

### 3. Criar empresa + utilizador
- `insert into empresas (nome) values ('Nome da Empresa') returning id;`
- Authentication → Users → convidar o utilizador
- `insert into membros (user_id, empresa_id) values (...)` (e opcionalmente `insert into admins (user_id) values (...)` para acesso global)

### 4. Variáveis de ambiente (Railway → Variables, ou `.env` local)
```
SUPABASE_URL=...
SUPABASE_KEY=...       (chave anon public)
RESEND_API_KEY=...     (para emails — reset de password e formulário de contacto)
```

### 5. Publicar
Railway → New Project → Deploy from GitHub repo → adicionar as variáveis acima. Deploy automático a cada push para `main`.

---

## Cálculos

### KMs efectuados
```
KMs efectuados = KMs desmontagem − KMs montagem
```
Se o pneu ainda estiver montado e o veículo tiver `km_atual` (via telemetria), estima-se `km_atual − KMs montagem` em alternativa (assinalado como estimado na UI).

### Custo médio por pneu
```
Custo médio = Soma dos custos de pneu ÷ Nº de pneus com custo preenchido
```

### Custo por km
```
€/km = Custo médio por pneu ÷ KMs médios por pneu
```

### Taxa de desgaste
```
Taxa (mm/1000km) = (Escultura inicial − Escultura final) ÷ KMs efectuados × 1000
```
Escultura inicial assumida: 16mm (Novo), 14mm (Remix/Rechapado), 12mm (Piso Aberto). Só calculada para registos com escultura final entre 0 e 20mm, agrupada por família de posição (Direção/Tração/Pusher/Tag/Eixo N), não pelo lugar exacto.

---

## Segurança

- Login obrigatório (email/password), com opção de recuperação por email.
- Row Level Security em todas as tabelas — acesso sempre filtrado por `empresa_id` via `membros`, ou global para `admins`.
- Credenciais de integrações (Supabase, Resend, telemetria) só em variáveis de ambiente/segredos — nunca no código.
- HTTPS em todos os pedidos.
