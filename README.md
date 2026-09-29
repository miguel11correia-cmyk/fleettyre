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
  auth.js                          — login, logout, mudar password (2 passos), esqueci-me da
                                     password
  nav.js                           — troca de página dentro da app (nav/navR/navReg)
  utils.js                         — helpers partilhados: formatação, cálculos de desgaste,
                                     SLOTS_VEICULO/SLOTS_REBOQUE (lugares fixos), loading()
                                     (com atraso de 200ms, para não "piscar" em operações rápidas)
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
  emails-fornecedores.js           — página "Faturas por email": ligar/desligar a caixa de email
                                     da empresa, sincronizar manualmente, listar/abrir/arquivar
                                     os emails de fornecedores encontrados (ver secção própria)
  telemetria.js                    — página "Telemetria (KMs)": ligar/desligar/sincronizar a
                                     integração de telemetria da própria empresa (self-service)

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
  _shared/                          — código partilhado entre funções:
                                     auth.ts (obterEmpresaId — deriva a empresa sempre do JWT do
                                     chamador), cors.ts (CORS_HEADERS/tratarPreflight, obrigatório
                                     em qualquer função chamada via fetch() do browser),
                                     adaptadores de telemetria e de email (ver secções próprias)
  telemetria-sync/                 — cron (pg_cron, diário): percorre todas as integrações de
                                     telemetria activas de todas as empresas
  telemetria-ligar/,
  telemetria-status/,
  telemetria-desligar/,
  telemetria-sync-manual/          — autenticadas, uma por acção do botão em "Telemetria (KMs)";
                                     empresa sempre derivada do JWT, nunca de um parâmetro
  email-oauth-iniciar/,
  email-oauth-callback/,
  email-oauth-desligar/,
  email-imap-ligar/,
  email-status/,
  email-sync/,
  email-sync-manual/               — equivalentes para "Faturas por email" (OAuth Outlook + IMAP)

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
| `marcas`, `fornecedores` | Listas geridas por empresa, usadas nos selects de marca/fornecedor em toda a app (`fornecedores.dominios_email`, `text[]` opcional, usado pelo filtro de "Faturas por email" — um fornecedor pode ter mais do que um domínio) |
| `stock_faturas`, `stock_linhas` | Faturas de compra de pneus e as suas linhas, para controlo de stock |
| `integracoes_telemetria` | Credenciais por empresa + fornecedor de telemetria (ver abaixo) — só-admin |
| `integracoes_email` | Tokens/credenciais por empresa + fornecedor de email (ver abaixo) — só-admin |
| `emails_fornecedores_pendentes` | Emails de fornecedores encontrados automaticamente, com o PDF já descarregado, à espera de o utilizador introduzir o valor manualmente num registo |

---

## Lugares fixos (posições de pneu)

Cada veículo/reboque com uma configuração de eixos conhecida (`num_eixos` não é "Outro") tem uma lista fixa de lugares (ex.: `"Tração Esq Int"`) definida em `SLOTS_VEICULO`/`SLOTS_REBOQUE` (`js/utils.js`). Em "Por matrícula"/"Por reboque", cada lugar aparece sempre — preenchido com o pneu activo desse lugar, ou vazio com um botão "+ Montar".

- **Registo**: continua a ser por categoria (Direção/Tração/Eixo N) + quantidade; a app distribui automaticamente pelos lugares livres dessa categoria, por ordem fixa.
- **Edição individual**: mostra o selector granular completo (todos os lugares livres + o lugar actual do próprio pneu), para corrigir uma posição específica.
- Veículos/reboques sem ficha, ou com configuração "Outro", mantêm uma lista solta sem lugares fixos (comportamento anterior a esta funcionalidade).

---

## Integração de telemetria (km actual)

`veiculos.km_atual`/`km_atual_em` é preenchido automaticamente (quando configurado) a partir do sistema de GPS/telemetria de cada empresa, e usado como fallback para estimar KMs percorridos quando um pneu ainda não foi desmontado. É só informativo — nunca substitui os KMs manuais dos registos de pneus.

**Self-service**: página "Telemetria (KMs)" (Registos), `js/telemetria.js` — qualquer empresa introduz as suas próprias credenciais do fornecedor e liga a integração sem intervenção manual na base de dados. `integracoes_telemetria` é só-admin (RLS), por isso a página nunca lê a tabela directamente — só chama as Edge Functions autenticadas abaixo, que derivam sempre a `empresa_id` do JWT de quem chama:

- `telemetria-ligar` — valida as credenciais com uma chamada leve à API do fornecedor (`testarCredenciais`) antes de gravar.
- `telemetria-status` — devolve só `{ligado, fornecedor, ultima_sincronizacao}`, nunca as credenciais.
- `telemetria-desligar` — desactiva a integração da própria empresa.
- `telemetria-sync-manual` — botão "Sincronizar agora"; separada da função de cron para um utilizador nunca poder forçar a sincronização de outra empresa.

`supabase/functions/telemetria-sync` é a função de cron (`pg_cron`, diariamente às 05:00 UTC) que percorre todas as integrações activas de todas as empresas. A lógica de sincronizar uma integração está partilhada em `_shared/telemetria-sync-logica.ts`, usada tanto pelo cron como pelo `-sync-manual`.

Cada fornecedor é um adaptador em `supabase/functions/_shared/<fornecedor>.ts`, cumprindo o contrato `AdaptadorTelemetria` (`obterOdometro`, `testarCredenciais`). Hoje só existe `cartrack.ts`. **Adicionar um fornecedor novo = escrever um adaptador desse tamanho — não é preciso tocar no resto da arquitectura.**

---

## Faturas por email ("Faturas por email")

Problema real que resolve: a oficina regista montagens/desmontagens em papel; o valor em € só chega semanas depois, por email, da parte do fornecedor — e encontrar essa factura no meio de centenas de emails não relacionados é o trabalho manual. Esta funcionalidade liga-se à caixa de email da empresa, filtra os emails que parecem facturas de pneus e deixa-os prontos (com o PDF já descarregado) para o utilizador consultar. **Não extrai valores automaticamente** — o utilizador continua a introduzir o custo manualmente no "Editar" de sempre, usando o PDF só como referência.

Página "Faturas por email" (Registos), `js/emails-fornecedores.js`. `integracoes_email` é só-admin (guarda tokens/credenciais), a UI nunca a lê directamente — só chama Edge Functions autenticadas, tal como a telemetria:

- `email-status` — `{ligado, conta_email, ultima_sincronizacao}`, nunca os tokens.
- `email-oauth-iniciar` / `email-oauth-callback` / `email-oauth-desligar` — fluxo OAuth partilhado por qualquer fornecedor OAuth (`?fornecedor=outlook` ou `?fornecedor=google`): "Ligar Outlook"/"Ligar Google" chama `-iniciar` (autenticado, gera um `state` assinado por HMAC com `empresa_id`+`fornecedor`+expiração curta) e o browser é redireccionado para o fornecedor; `-callback` (pública, sem verificação de JWT — é o fornecedor que a chama, nunca o utilizador directamente) lê o `fornecedor` do `state`, valida-o, troca o código pelos tokens através do adaptador certo e grava a integração — mesma função para os dois fornecedores, nunca precisou de ramificação por fornecedor.
- `email-imap-ligar` — alternativa para contas de email que não são Microsoft 365/Google Workspace (ex.: email de hosting normal). Guarda as credenciais IMAP directamente; usa um cliente IMAP e um parser MIME escritos de raiz em `_shared/imap-cliente.ts`/`_shared/mime-parser.ts`, porque não existe biblioteca IMAP fiável para o runtime Deno das Edge Functions.
- `email-sync` (cron, de 6 em 6h) / `email-sync-manual` (botão "Sincronizar agora") — ambas chamam `_shared/email-sync-logica.ts`, que por cada integração activa: renova o token OAuth se necessário, lista mensagens recentes, aplica o filtro de relevância, descarrega o PDF para o bucket `faturas-pdf` (subcaminho `{empresa_id}/emails/{mensagem_id}.pdf`) e insere em `emails_fornecedores_pendentes`.

Cada fornecedor de email é um adaptador cumprindo o contrato `AdaptadorEmail` em `_shared/email-tipos.ts` — o mesmo padrão da telemetria. Hoje existem três: `outlook.ts` (Microsoft Graph), `google.ts` (Gmail API — serve tanto Google Workspace como Gmail pessoal, a Google não distingue os dois no OAuth) e `imap.ts`.

**Filtro de relevância** (`_shared/filtro-email.ts`), pensado em camadas para não deixar escapar facturas (lê assunto, corpo e nome do PDF anexado, não só o remetente) nem apanhar facturas de fornecedores não relacionados com pneus (a palavra genérica "fatura"/"invoice" sozinha não é suficiente):

1. Tem de ter um PDF anexado (condição obrigatória).
2. E depois: o remetente bate com algum dos `dominios_email` de um fornecedor da empresa **ou** aparece uma palavra específica de pneus (pneu, pneus, pneumático(s), tyre(s), tire(s), rechapagem, recauchutagem) no assunto, no corpo ou no nome do PDF.

Cada entrada em `dominios_email` pode ser um domínio (`fornecedor.pt`, compara só o domínio do remetente) ou um email completo (`jose@gmail.com`, compara o endereço inteiro) — necessário para fornecedores que usam um provedor partilhado (Gmail, Outlook.pt, Hotmail, etc.), onde um domínio sozinho apanharia qualquer pessoa que use esse provedor, não só o fornecedor em questão.

---

## Email (Resend)

Domínio `fleet-tyre.com` verificado no Resend (SPF/DKIM/DMARC via Cloudflare). Dois usos distintos, ambos autenticados com a mesma API key do Resend:

1. **Supabase Auth (SMTP)** — Authentication → Emails → SMTP Settings, aponta para `smtp.resend.com` com a API key como password. Usado para o email de "Reset Password" (template em português, editado em Authentication → Emails → Templates).
2. **Formulário de contacto** (`POST /api/contacto` em `server.js`) — chama a API REST do Resend directamente (`fetch`, sem dependências). Envia uma notificação para o dono da app e uma confirmação automática (com assinatura em banner) para quem preencheu o formulário.

Variável de ambiente necessária no Railway: `RESEND_API_KEY`.

---

## Autenticação

- Login por email/password (Supabase Auth). Depois de autenticar, se o utilizador tiver acesso a mais do que uma empresa (só acontece para admins), escolhe qual quer usar; a escolha fica em `localStorage`.
- **Mudar password**: painel lateral acessível a partir do menu, a dois passos — primeiro confirma a password actual (`sb.auth.signInWithPassword`, que também satisfaz o requisito de sessão recente do Supabase para alterar a password), só depois revela os campos de nova password/confirmar (`sb.auth.updateUser`).
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

### 5. Segredos das Edge Functions (Supabase Dashboard → Edge Functions → Secrets)
Só necessários para "Faturas por email" via Outlook/Google (o adaptador IMAP não precisa de nada disto — as credenciais vêm do próprio utilizador em runtime):
```
MS_CLIENT_ID=...        (App Registration no Azure/Entra ID, tipo "Web", multi-tenant)
MS_CLIENT_SECRET=...
MS_TENANT=organizations
GOOGLE_CLIENT_ID=...     (OAuth Client ID no Google Cloud Console, tipo "Web application")
GOOGLE_CLIENT_SECRET=...
OAUTH_STATE_SECRET=...  (string aleatória longa, só para assinar o `state` do OAuth — partilhado por todos os fornecedores OAuth)
CRON_SECRET=...          (string aleatória longa — exigida por telemetria-sync e email-sync, para o pg_cron ser a única coisa que as consegue chamar; ver migrations/026_cron_secret.sql)
```
Na função `email-oauth-callback`, desligar manualmente "Verify JWT" nas definições da função no Dashboard (é o fornecedor — Microsoft ou Google — que chama este endpoint, não traz JWT do Supabase).

Para o Google especificamente: Google Cloud Console → criar/escolher um projecto → **APIs & Services → Library** → activar "Gmail API" → **APIs & Services → OAuth consent screen** (tipo "External", basta ficar em modo "Testing" com o teu próprio email como "Test user" — não precisa de verificação da Google para uso interno) → **APIs & Services → Credentials → Create Credentials → OAuth client ID**, tipo "Web application", com o Redirect URI igual ao do Outlook (`.../functions/v1/email-oauth-callback`, a mesma função serve os dois fornecedores).

### 6. Publicar
Railway → New Project → Deploy from GitHub repo → adicionar as variáveis do passo 4. Deploy automático a cada push para `main`. Edge Functions e migrações continuam manuais (ver "Fluxo de trabalho" acima).

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

### Custo por km (por veículo)
```
€/km = Custo dos pneus ACTIVOS (montados agora) ÷ KMs médios dos pneus ACTIVOS
```
Numerador e denominador usam só os pneus activos (não o histórico completo) — senão o custo (uma soma) cresceria sempre com o tempo enquanto os KMs médios (uma média) ficam estáveis, inflacionando o rácio artificialmente. Os KMs médios dos activos vêm de `kmsReaisOuEstimados` (`js/alertas.js`) — cascata real (telemetria) → KMs máximos conhecidos do veículo → média mensal entre montagens passadas → constante de 7500km/mês, a mesma lógica já usada nos Alertas desde antes de existir telemetria, por isso funciona sempre. Usado em "Por matrícula" e em "Análise → Comparação entre veículos". Para reboques, o denominador continua a ser a duração média (meses) — não têm conta-quilómetros próprio — e o custo é sempre só dos pneus activos (`€/mês`).

### "Por matrícula"/"Por reboque" — 5 cartões, não mais
Reduzido de propósito (chegou a ter 8) para as perguntas que quem gere a frota realmente faz ao abrir esta página: quantos pneus tem agora (**Pneus activos**), está a sair caro por km (**€/km**, em destaque visual — é o número mais importante), quanto tenho investido agora (**Custo activo**), quanto já gastei ao todo neste veículo (**Custo histórico**), e quanto duram os pneus (**KMs médios/pneu**, histórico — não activos, por ser mais representativo da duração real). Números de apoio ao cálculo que não respondem a uma pergunta própria (contagem total de pneus, custo médio/pneu, KMs médios só dos activos) ficaram de fora — continuam calculáveis no código, só não têm cartão próprio.

Em **"Marcas"** (veículos e reboques) o cálculo é diferente por natureza: não há uma entidade única a acumular histórico para sempre (são vários pneus independentes de vários veículos), por isso usa-se antes o **histórico completo** da marca — `€/km = custo médio por pneu ÷ KMs médios por pneu` (ou `€/mês` nos reboques), mais amostras dão uma média mais robusta. Tabela ordenada por ranking (mais barata primeiro).

### Taxa de desgaste
```
Taxa (mm/1000km) = (Escultura inicial − Escultura final) ÷ KMs efectuados × 1000
```
Escultura inicial assumida: 16mm (Novo), 14mm (Remix/Rechapado), 12mm (Piso Aberto). Só calculada para registos com escultura final entre 0 e 20mm, agrupada por família de posição (Direção/Tração/Pusher/Tag/Eixo N), não pelo lugar exacto.

---

## Interações e animações

Segue o guia próprio `SKILL_design.md` (na raiz do repo). Pontos concretos já aplicados em `style.css`/`js/utils.js`:

- Painéis laterais (ex. mudar password, lugares) deslizam (`transform: translateX`) em vez de aparecer/desaparecer instantaneamente.
- Botões têm feedback de pressão (`:active { transform: scale(0.97) }`), excepto os itens de navegação da sidebar (clicados dezenas de vezes por dia — animá-los seria ruído, não feedback).
- `prefers-reduced-motion` desliga estas transformações.
- `loading()` só mostra o overlay se a operação ainda estiver pendente passados 200ms (`LOADING_DELAY_MS`), para não "piscar" em cliques/trocas de página rápidas.

---

## Segurança

- Login obrigatório (email/password, com mudança a 2 passos e recuperação por email).
- Row Level Security em todas as tabelas — acesso sempre filtrado por `empresa_id` via `membros`, ou global para `admins`. Tabelas com credenciais/tokens (`integracoes_telemetria`, `integracoes_email`) são só-admin; o frontend nunca as lê directamente, só através de Edge Functions autenticadas que derivam a `empresa_id` sempre do JWT de quem chama, nunca de um parâmetro do pedido. `membros`/`admins` só têm política de leitura para utilizadores normais — nenhum consegue escrever-se a si próprio numa empresa ou promover-se a admin.
- `telemetria-sync`/`email-sync` (as funções de cron, que usam a service role key) exigem o cabeçalho `x-cron-secret` — a chave anon/publishable sozinha (pública, embutida no HTML) não chega para as chamar, ao contrário do que acontecia antes desta correcção.
- Credenciais de integrações (Supabase, Resend, telemetria, Microsoft Graph, IMAP) só em variáveis de ambiente/segredos — nunca no código.
- Funções chamadas pelo browser com cabeçalho `Authorization` custom exigem tratamento explícito de CORS/preflight (`_shared/cors.ts`) — o Supabase não adiciona isto automaticamente.
- HTTPS em todos os pedidos.
