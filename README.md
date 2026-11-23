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
  nav.js                           — troca de página dentro da app (nav/navR/navReg/navInicio/
                                     navCompras/navStock); páginas acessíveis só a partir de um botão
                                     (nunca têm entrada própria na barra lateral — Registar pneu,
                                     Faturas por email) são abertas directamente pela função do
                                     próprio botão, não por aqui
  utils.js                         — helpers partilhados: formatação (`fmt`/`fmtEur`, separador
                                     de milhares sempre a espaço, nunca a depender do locale do
                                     browser), cálculos de desgaste, SLOTS_VEICULO/SLOTS_REBOQUE
                                     (lugares fixos), edição/desmontagem em massa
                                     (`abrirEdicaoBulk`, partilhada por veículos e reboques),
                                     loading() (com atraso de 200ms, para não "piscar" em
                                     operações rápidas)
  frota_cadastro.js                — ficha de veículos (marca/modelo/nº eixos), lista de marcas
  frota.js                         — "Por veículo": lugares fixos + histórico de um veículo,
                                     selecção múltipla de pneus activos (desmontar/editar vários
                                     de uma vez — ex.: todo o eixo de Direção)
  inicio.js                        — página "Início", sempre acessível independentemente da
                                     secção onde se está: aviso de "Precisa da tua atenção"
                                     (críticos de veículos + reboques juntos), o dashboard da
                                     frota (KPIs + gráficos, com identidade visual própria — ver
                                     "Interações e animações") e o formulário único de registo de
                                     montagem (painel "Registar pneu", aberto a pedido, nunca
                                     ocupa o ecrã principal) — um selector Camião/Reboque no
                                     topo do formulário decide a tabela de destino
                                     (`pneus`/`reboques`) e que campos mostrar (ex.: KMs só em
                                     camiões)
  alertas.js, analytics.js,
  marcas.js, compras.js, stock.js  — cada página da app, um ficheiro por secção; `compras.js`
                                     junta fornecedores (comparação de preços por marca/modelo/
                                     tipo, sempre com a frota toda), o desempenho por marca
                                     (antiga página "Marcas", fundida aqui), e a pesquisa de
                                     "Atribuir preço de fatura antiga a pneus já montados" (não é
                                     stock, é atribuição de custo a pneus já activos); `marcas.js`
                                     ficou só com a gestão do catálogo (marcas e os seus modelos/
                                     subtipos); `stock.js` é partilhado por veículos e reboques
                                     (um fornecedor ou fatura de stock é o mesmo conceito
                                     independentemente do destino — ver secção "Visão geral", igual
                                     à de `compras.js`/`inicio.js`)
  custom-select.js                 — substitui os <select> [data-fancy] por um combobox à parte,
                                     mantendo o <select> original escondido como fonte da verdade
  pdf-anexo.js                     — anexar/ver PDF em registos, faturas e pneus em oficina
                                     (mecanismo único partilhado pelos três contextos)
  emails-fornecedores.js           — "Faturas por email": ligar/desligar a caixa de email da
                                     empresa, sincronizar manualmente, listar/abrir/arquivar os
                                     emails de fornecedores encontrados (ver secção própria) —
                                     não é uma página de configuração, é uma aba de ecrã inteiro
                                     que só abre a partir do botão "Faturas" em Início (tarefa do
                                     dia a dia, não uma definição que se mexe uma vez e esquece)
  telemetria.js                    — "Telemetria (KMs)": ligar/desligar/sincronizar a integração
                                     de telemetria da própria empresa (self-service) — esta sim
                                     fica em Configuração, num grupo "Integrações" à parte de
                                     "Registos" (Fornecedores/Marcas/Registar veículo/reboque),
                                     por ser uma ligação a um serviço externo, não um registo

js/reboques/                       — equivalentes dos ficheiros acima, para a secção "Reboques"
                                     (frota_cadastro_r.js, frota_r.js, analytics_r.js, alertas_r.js,
                                     …) — não tem registar_r.js, compras_r.js nem stock_r.js
                                     próprios (ver inicio.js/compras.js/stock.js, partilhados pelas
                                     duas secções)

migrations/                        — alterações à base de dados, ficheiros .sql numerados por
                                     ordem, corridos manualmente no SQL Editor do Supabase
                                     (000 = schema inicial; nunca editar um já publicado, criar
                                     sempre o próximo número)

supabase/functions/                — Edge Functions (Deno), deploy manual via Supabase CLI
  _shared/                          — código partilhado entre funções:
                                     auth.ts (obterEmpresaId — deriva a empresa sempre do JWT do
                                     chamador), cors.ts (corsHeaders()/tratarPreflight, restringe
                                     a origem a fleet-tyre.com/localhost, obrigatório em qualquer
                                     função chamada via fetch() do browser),
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

**Selecção múltipla**: pneus de Direção/Tração (ou de um eixo inteiro, nos reboques) saem quase sempre ao mesmo tempo — em "Por veículo"/"Por reboque", cada pneu activo tem uma checkbox; seleccionar vários mostra uma barra de acções (contagem + "Desmontar seleção"/"Editar seleção") dentro do próprio cartão "Posições". "Desmontar seleção" reutiliza o mesmo painel da desmontagem individual, só que aplica o mesmo mês/KMs/rasto/destino a todos os seleccionados de uma vez. "Editar seleção" (`abrirEdicaoBulk`, `js/utils.js`, partilhada por veículos e reboques) só tem os campos que fazem sentido partilhar entre vários pneus (marca/modelo, medida, fornecedor, tipo, custos) — nunca matrícula/posição/mês de montagem/KMs, que são sempre individuais — e só aplica os campos que forem preenchidos; os deixados em branco mantêm o valor que cada registo já tinha.

---

## Integração de telemetria (km actual)

`veiculos.km_atual`/`km_atual_em` é preenchido automaticamente (quando configurado) a partir do sistema de GPS/telemetria de cada empresa, e usado como fallback para estimar KMs percorridos quando um pneu ainda não foi desmontado. É só informativo — nunca substitui os KMs manuais dos registos de pneus.

**Self-service**: página "Telemetria (KMs)" (Configuração → grupo "Integrações"), `js/telemetria.js` — qualquer empresa introduz as suas próprias credenciais do fornecedor e liga a integração sem intervenção manual na base de dados. `integracoes_telemetria` é só-admin (RLS), por isso a página nunca lê a tabela directamente — só chama as Edge Functions autenticadas abaixo, que derivam sempre a `empresa_id` do JWT de quem chama:

- `telemetria-ligar` — valida as credenciais com uma chamada leve à API do fornecedor (`testarCredenciais`) antes de gravar.
- `telemetria-status` — devolve só `{ligado, fornecedor, ultima_sincronizacao}`, nunca as credenciais.
- `telemetria-desligar` — desactiva a integração da própria empresa.
- `telemetria-sync-manual` — botão "Sincronizar agora"; separada da função de cron para um utilizador nunca poder forçar a sincronização de outra empresa.

`supabase/functions/telemetria-sync` é a função de cron (`pg_cron`, diariamente às 05:00 UTC) que percorre todas as integrações activas de todas as empresas. A lógica de sincronizar uma integração está partilhada em `_shared/telemetria-sync-logica.ts`, usada tanto pelo cron como pelo `-sync-manual`.

Cada fornecedor é um adaptador em `supabase/functions/_shared/<fornecedor>.ts`, cumprindo o contrato `AdaptadorTelemetria` (`obterOdometro`, `testarCredenciais`). Hoje só existe `cartrack.ts`. **Adicionar um fornecedor novo = escrever um adaptador desse tamanho — não é preciso tocar no resto da arquitectura.**

---

## Faturas por email ("Faturas por email")

Problema real que resolve: a oficina regista montagens/desmontagens em papel; o valor em € só chega semanas depois, por email, da parte do fornecedor — e encontrar essa factura no meio de centenas de emails não relacionados é o trabalho manual. Esta funcionalidade liga-se à caixa de email da empresa, filtra os emails que parecem facturas de pneus e deixa-os prontos (com o PDF já descarregado) para o utilizador consultar. **Não extrai valores automaticamente** — o utilizador continua a introduzir o custo manualmente no "Editar" de sempre, usando o PDF só como referência.

Aba de ecrã inteiro aberta pelo botão "Faturas" em Início (`js/emails-fornecedores.js`) — deliberadamente fora de Configuração: é uma tarefa do dia a dia (conferir, alocar e arquivar facturas), não uma definição que se liga uma vez e se esquece. Fecha sempre com o botão "Voltar" (volta para Início, de onde é sempre aberta); o regresso do fluxo OAuth do Outlook/Google abre-a directamente, sem passar por mais nenhuma página. `integracoes_email` é só-admin (guarda tokens/credenciais), a UI nunca a lê directamente — só chama Edge Functions autenticadas, tal como a telemetria:

- `email-status` — `{ligado, conta_email, ultima_sincronizacao}`, nunca os tokens.
- `email-oauth-iniciar` / `email-oauth-callback` / `email-oauth-desligar` — fluxo OAuth partilhado por qualquer fornecedor OAuth (`?fornecedor=outlook` ou `?fornecedor=google`): "Ligar Outlook"/"Ligar Google" chama `-iniciar` (autenticado, gera um `state` assinado por HMAC com `empresa_id`+`fornecedor`+expiração curta) e o browser é redireccionado para o fornecedor; `-callback` (pública, sem verificação de JWT — é o fornecedor que a chama, nunca o utilizador directamente) lê o `fornecedor` do `state`, valida-o, troca o código pelos tokens através do adaptador certo e grava a integração — mesma função para os dois fornecedores, nunca precisou de ramificação por fornecedor.
- `email-imap-ligar` — alternativa para contas de email que não são Microsoft 365/Google Workspace (ex.: email de hosting normal). Guarda as credenciais IMAP directamente; usa um cliente IMAP e um parser MIME escritos de raiz em `_shared/imap-cliente.ts`/`_shared/mime-parser.ts`, porque não existe biblioteca IMAP fiável para o runtime Deno das Edge Functions.
- `email-sync` (cron, de 6 em 6h) / `email-sync-manual` (botão "Sincronizar agora") — ambas chamam `_shared/email-sync-logica.ts`, que por cada integração activa: renova o token OAuth se necessário, lista mensagens recentes, aplica o filtro de relevância, descarrega o PDF para o bucket `faturas-pdf` (subcaminho `{empresa_id}/emails/{mensagem_id}.pdf`) e insere em `emails_fornecedores_pendentes`.

Cada fornecedor de email é um adaptador cumprindo o contrato `AdaptadorEmail` em `_shared/email-tipos.ts` — o mesmo padrão da telemetria. Hoje existem três: `outlook.ts` (Microsoft Graph), `google.ts` (Gmail API — serve tanto Google Workspace como Gmail pessoal, a Google não distingue os dois no OAuth) e `imap.ts`.

**IMAP — nunca descarrega PDFs irrelevantes**: ao contrário do Graph/Gmail (que filtram por anexo do lado da API, barato), o IMAP não tem um "$select" equivalente. `_shared/imap-cliente.ts` tem um parser mínimo das listas parentizadas do protocolo IMAP (BODYSTRUCTURE/ENVELOPE), que calcula o número exacto de cada parte MIME (RFC 3501: "1", "2.1", ...) e extrai remetente/assunto — tudo isto num só pedido em lote (`ClienteIMAP.verificarMensagens`), sem descarregar conteúdo nenhum. `imap.ts` usa isto para: 1) identificar mensagens com PDF; 2) pedir só a parte de **texto** (pequena) para decidir relevância com o filtro (abaixo); 3) só descarregar o **PDF em si** das que já passaram esse filtro. Numa caixa geral, a esmagadora maioria dos emails com algum PDF (electricidade, seguros, software, ...) nunca chega a ter o anexo tocado — é aqui que está a poupança de CPU/memória. Rede de segurança: se o parser não conseguir identificar a parte do PDF com confiança (estrutura exótica), cai para descarregar a mensagem completa só dessa mensagem, em vez de arriscar perder uma factura.

Mesmo assim, para não haver limite nenhum que possa cortar uma sincronização a meio (`LIMITE_DESCARGAS_PDF` em `imap.ts`, uma rede de segurança que não deve ser atingida em uso normal), `listarMensagensRecentes` devolve `{ mensagens, completo, ateData, totalNaJanela, examinadas }` em vez de só a lista — quando `completo: false`, `_shared/email-sync-logica.ts` avança `ultima_sincronizacao` só até `ateData` (não até "agora"), para a sincronização seguinte continuar exactamente dali. `totalNaJanela`/`examinadas` aparecem também na app, no feedback do botão "Sincronizar agora", para dar visibilidade real do progresso sem precisar de ir aos logs. A pesquisa `SINCE` do IMAP só tem granularidade de dia — sincronizar várias vezes no mesmo dia reexamina sempre as mesmas mensagens desse dia (sem custo relevante, e sem duplicados, graças ao dedup por Message-ID), até passar para o dia seguinte.

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

## Testes

`npm test` (`node --test`, nativo do Node — sem dependências novas nem build step, como o resto da app). Corre automaticamente em CI a cada push para `main` e em cada PR, via `.github/workflows/tests.yml`.

Cobre a **lógica de cálculo e de agregação/render** de `js/*.js` (`tests/*.test.js`): €/km e €/mês por categoria, taxa de desgaste, "Mais urgente", comparação de preços entre fornecedores, desempenho por marca, KPIs e tabelas do Início, e os geradores de linha das tabelas "Lugares"/"Histórico" (veículos e reboques). `tests/helpers/load-app-scripts.js` carrega os ficheiros reais de `js/` para dentro de um contexto Node isolado (`vm`), para testar o código tal como ele é em produção, sem o duplicar nos testes — só funciona para ficheiros sem chamadas DOM a nível de topo (fora de funções). Para as funções que escrevem `innerHTML`/`textContent`, `tests/helpers/dom-stub.js` simula o `document` minimamente (sem fazer parsing de HTML nenhum), suficiente para verificar o conteúdo gerado com regex/`includes`.

**Fora do âmbito destes testes** (por ora só verificado manualmente no browser): tudo o que é assíncrono/depende do Supabase (`loadFrota`, `loadStock`, `guardarEdicaoBulk`, etc.) — precisaria de um mock do cliente `sb` ou de testes de integração contra um projecto Supabase de teste, uma abordagem diferente desta; e as Edge Functions (`supabase/functions/`), que correm em runtime Deno, não Node.

Ao adicionar uma fórmula nova (custo, desgaste, comparação entre categorias/veículos/reboques), vale a pena escrever já aqui o cenário que a pode pôr em causa — foi assim que se apanhou o bug do €/km por categoria (ver `tests/custo-por-km.test.js`) e o da taxa de desgaste do "Mais urgente" (`tests/mais-urgente.test.js`).

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

### Custo por km (por veículo) — sempre por categoria, nunca combinado
```
€/km = Custo MÉDIO por pneu ACTIVO da categoria ÷ KMs médios dos pneus ACTIVOS da categoria
```
"Categoria" é Direção ou Tração (veículos) / Eixo 1, 2 ou 3 (reboques, `€/mês` em vez de `€/km` — não têm conta-quilómetros próprio). **Nunca** um €/km único combinando todas as posições: Direção tem metade dos pneus de Tração (e, nos reboques, configurações de rodado duplo têm o dobro dos pneus por eixo), por isso cada categoria desgasta e pesa no custo a um ritmo muito diferente — uma média combinada escondia sempre qual delas estava de facto a custar mais por km.

O numerador é o custo **médio** por pneu, não a soma — foi um bug real: somar o custo de todos os pneus activos da categoria e dividir pela média de KMs/meses inflacionava sempre o rácio de quem tem mais pneus nessa categoria (ex.: Tração, com o dobro de Direção), mesmo quando cada pneu individual era mais barato por km. Custo e KMs usam sempre só os pneus activos (não o histórico completo) — senão o custo (uma soma) cresceria sempre com o tempo enquanto os KMs médios (uma média) ficam estáveis, inflacionando o rácio artificialmente. Os KMs médios dos activos vêm de `kmsReaisOuEstimados` (`js/alertas.js`) — cascata real (telemetria) → KMs máximos conhecidos do veículo → média mensal entre montagens passadas → constante de 7500km/mês, a mesma lógica já usada nos Alertas desde antes de existir telemetria, por isso funciona sempre. Usado em "Por veículo"/"Por reboque" (`eurKmPorCategoria`/`eurMesPorEixo`) e em "Análise → Comparação entre veículos/reboques" (`calcularComparacaoCategoria(Reboques)`) — nesta última, os KPIs (média/mais eficiente/menos eficiente) calculam-se por categoria, mas a tabela de detalhe fica combinada numa só, com as categorias lado a lado por veículo/reboque.

### "Por veículo"/"Por reboque" — 5 cartões, não mais
Reduzido de propósito (chegou a ter 8) para as perguntas que quem gere a frota realmente faz ao abrir esta página: quantos pneus tem agora (**Pneus activos**), está a sair caro por km (**€/km, por Direção e Tração** — ver acima), quanto tenho investido agora (**Custo activo**), quanto já gastei ao todo neste veículo (**Custo histórico**), e qual o pneu que precisa de atenção primeiro (**Mais urgente** — ver "Taxa de desgaste" abaixo; nos reboques, o pneu mais perto do limite crítico do seu próprio eixo, por margem até ao limite, não por meses em bruto, já que o Eixo 2 aguenta muito mais tempo que o Eixo 1/3). O card "Mais urgente" é clicável e leva directo a Alertas já filtrado pelo nível do pneu mostrado. Números de apoio ao cálculo que não respondem a uma pergunta própria ficaram de fora — continuam calculáveis no código, só não têm cartão próprio.

Em **"Compras" → Desempenho por marca** (fundiu a antiga página "Marcas") o cálculo é diferente por natureza: não há uma entidade única a acumular histórico para sempre (são vários pneus independentes de vários veículos), por isso usa-se antes o **histórico completo** da marca, detalhado por Marca → Modelo (subtipo) → Tipo, só com registos desmontados completos — `€/1000km` (veículos) ou `€/mês` (reboques) é a média das razões custo/eficiência de cada registo individual, não "custo médio ÷ KMs médios"; isto já evita por construção o mesmo viés de contagem de pneus descrito acima. Ausente na vista unificada (não combinável entre as duas métricas). Tabela ordenada por ranking (mais barata/eficiente primeiro).

### Comparação de preços (Compras)
Por marca + modelo (+ filtro de tipo), fornecedores ordenados do mais barato ao mais caro, sempre com a **frota toda** (ignora o selector "Visão geral", que só se aplica ao Desempenho por marca — por isso o selector vive dentro do próprio cabeçalho desse card, não num card à parte no topo da página: pô-lo lá sugeriria que também afecta a Comparação de Preços, quando não afecta nada ali). A percentagem de cada fornecedor é sempre contra o **fornecedor mais barato actual**, nunca contra uma média histórica — decisão deliberada: uma média histórica desce sozinha à medida que mais compras vão para o fornecedor mais barato, tornando a percentagem cada vez menos informativa com o tempo; ancorar no mais barato actual mantém o sinal sempre claro ("és X% mais caro que a melhor opção disponível agora").

### Taxa de desgaste
```
Taxa (mm/1000km) = (Rasto inicial − Rasto final) ÷ KMs efectuados × 1000
```
Rasto inicial assumido: 16mm (Novo), 14mm (Remix/Rechapado), 10mm (Piso Aberto). Só calculada para registos com rasto final entre 0 e 20mm, agrupada por família de posição (Direção/Tração/Pusher/Tag/Eixo N), não pelo lugar exacto. Taxas acima de `TAXA_DESGASTE_MAX` (0.26mm/1000km, `js/utils.js`) são rejeitadas (devolve `null`, como se o registo não existisse para este cálculo) — acima disto, um "Novo" chegaria a crítico (13mm de desgaste) em menos de 50 000km, o mínimo aceitável para desgaste normal de pesados; é quase sempre um erro de registo (KMs trocados) ou um evento catastrófico (rebentamento), não desgaste gradual, e deixá-lo entrar distorceria a média de toda a combinação marca+tipo+posição a que pertence, não só esse pneu.

**Taxa estimada para um pneu activo** (`taxaEstimada`, `js/alertas.js`) — a taxa acima só existe para registos já fechados (desmontados com rasto final); para um pneu ainda montado, estima-se a partir do histórico, numa cascata do mais específico ao mais genérico: marca+tipo+posição → marca+tipo → marca → média de toda a frota → constante fixa do sector (0.08mm/1000km). Cada nível **mistura-se** com o nível mais geral a seguir, pesado pelo seu próprio nº de registos (`CREDIBILIDADE_TAXA_DESGASTE = 5`: com poucos registos, o peso fica perto de 0 e a mistura fica sobretudo presa ao nível mais geral; com muitos mais, o peso aproxima-se de 1 e a estimativa aproxima-se da média real desse nível) — nunca troca de repente de um extremo para o outro ao encontrar o primeiro nível com pelo menos 1 registo, como acontecia antes. Isto é deliberado: um único pneu com um encerramento atípico (ex.: saiu cedo por um furo) numa combinação marca+tipo+posição específica não deve dominar por completo a estimativa só por ser a mais específica disponível — a precisão sobe gradualmente à medida que há mais histórico nessa combinação, nunca de um salto só com 1 registo. Testado em `tests/alertas.test.js` com o cenário exacto descrito aqui (frota com 200 registos a 0.11 vs. uma marca com só 2 registos a 0.20).

Esta mesma estimativa (`calcularEstimativasDesgaste`, `js/alertas.js`) alimenta tanto a página Alertas como o cartão "Mais urgente" de "Por veículo" — para os dois darem sempre o mesmo valor para o mesmo pneu, "Mais urgente" tem de calcular a taxa com os pneus da **frota toda**, nunca só os do veículo seleccionado (`loadFrota` busca a frota toda só para este cálculo, depois filtra o resultado pela matrícula) — foi outro bug real: calculado só com o histórico do veículo, a taxa caía quase sempre no valor-padrão fixo (0.08mm/1000km) em vez da taxa real observada na frota por marca/tipo/posição.

---

## Interações e animações

Segue o guia próprio `SKILL_design.md` (na raiz do repo). Pontos concretos já aplicados em `style.css`/`js/utils.js`:

- O bloco de KPIs + gráficos de Início (`.dash-panel`, `style.css`) tem fundo e friso (vermelho da marca) próprios, com o selector "Visão geral" integrado no cabeçalho — antes eram cartões soltos directamente sobre o fundo da página, sem nada a dizer que pertenciam todos à mesma coisa. O rótulo "DASHBOARD" (`.dash-panel-eyebrow`) é o único título do cabeçalho (sem subtítulo por baixo), em `.font-display` (Archivo 800 itálico maiúsculas — a letra de impacto da marca, ver comentário na própria classe) e a preto, acompanhado do ícone `assets/icon-dashboard.png` também a preto — usado tal como foi fornecido, nunca redesenhado; a cor vem de o aplicar como `mask-image` com `background-color`, não de editar o PNG.
- Ícones fornecidos como imagem (não SVG desenhadas aqui), todos pela mesma técnica (`mask-image` + `background-color: currentColor`, para acompanharem o estado de quem os usa): os 4 botões "comuns" da sidebar (Configuração/Início/Compras/Stock, `.nav-inicio-icon` — `assets/icon-config.png`/`icon-inicio.png`/`icon-compras.png`/`icon-stock.png`), todos do mesmo lote/estilo (silhueta sólida simples), e o item "Alertas" (`.ni-icon-img`, `assets/icon-bell.png`, lote anterior — ainda por uniformizar). Os ficheiros não têm todos a mesma margem à volta do desenho dentro do canvas (medido via bounding box dos píxeis não-transparentes: `icon-stock` só preenche ~81% do canvas, `icon-compras` ~92%, os outros ~98-100%) — por isso pareciam de tamanhos diferentes lado a lado mesmo com a mesma caixa CSS; compensado por `transform: scale()` (1.2 no stock, 1.06 no compras), nunca a recortar/editar os ficheiros em si. O ícone do cabeçalho "DASHBOARD" (`assets/icon-dashboard.png`) também é de um lote anterior (mais ilustrativo) — é o que falta trocar para a identidade dos ícones da app ficar completamente coesa. O cartão "Precisa da tua atenção" (Início) e o "Mais urgente" (Por veículo/reboque) usam os dois o ponto simples de sempre (`.live-dot`), sem ícone — foram testados com o sino a pulsar no lugar do ponto, mas revertido a pedido explícito.
- Camião/Reboque (`.icon-truck-img`/`.icon-trailer-img`, `assets/icon-truck.png`/`icon-trailer.png`) seguem a mesma técnica, em todos os sítios onde apareciam (selector Camiões/Reboques, "Registar veículo/reboque", "Por veículo/reboque", o par de botões do formulário único de registo, e os rótulos "Matrícula"/"Reboque" — `ICON_VEICULO`/`ICON_REBOQUE` em `frota.js`/`frota_r.js` incluídos) — substituem as antigas SVG `#icon-truck`/`#icon-trailer` do sprite (removidas, já sem utilização). Sem tamanho por omissão nestas duas classes: cada utilização mantém o tamanho exacto que a SVG tinha nesse sítio (13 a 16px, conforme o contexto).
- Painéis laterais (ex. mudar password, lugares) deslizam (`transform: translateX`) em vez de aparecer/desaparecer instantaneamente; alguns (Registar pneu) abrem antes centrados (`.panel-center`) em vez de laterais, por serem acessíveis de qualquer página, não só de uma em concreto.
- Botões têm feedback de pressão (`:active { transform: scale(0.97) }`), excepto os itens de navegação da sidebar (clicados dezenas de vezes por dia — animá-los seria ruído, não feedback).
- `prefers-reduced-motion` desliga estas transformações.
- `loading()` só mostra o overlay se a operação ainda estiver pendente passados 200ms (`LOADING_DELAY_MS`), para não "piscar" em cliques/trocas de página rápidas.
- A pesquisa de "Atribuir preço de fatura antiga" fica ao topo de Compras, sem card à volta (é uma ferramenta, não uma leitura) — só um rótulo discreto por cima. É uma barra interactiva única (`.alo-searchbar`) — todos os filtros (Marca/Modelo/Medida/Fornecedor/Tipo/Mês) vivem dentro dela como "pills" compactas, não empilhados por baixo; a lupa no fim é o único ícone de procurar (não há outro decorativo a duplicar a ideia). O tipo (Camiões/Reboques) é um segmentado (`.alo-tipo-toggle`), não um `<select>`, por só ter 2 opções — lê-se qual está activa sem abrir nada; `.alo-sep` separa visualmente os 3 grupos da barra (tipo · filtros · ações). Os selects reaproveitam o combobox customizado (`custom-select.js`) com dimensões mais pequenas — a lista aberta tem um `min-width` próprio (`.fsel-list`) para não cortar o texto das opções, já que o trigger que a abre é deliberadamente estreito.

---

## Segurança

- Login obrigatório (email/password, com mudança a 2 passos e recuperação por email).
- Row Level Security em todas as tabelas — acesso sempre filtrado por `empresa_id` via `membros`, ou global para `admins`. Tabelas com credenciais/tokens (`integracoes_telemetria`, `integracoes_email`) são só-admin; o frontend nunca as lê directamente, só através de Edge Functions autenticadas que derivam a `empresa_id` sempre do JWT de quem chama, nunca de um parâmetro do pedido. `membros`/`admins` só têm política de leitura para utilizadores normais — nenhum consegue escrever-se a si próprio numa empresa ou promover-se a admin.
- `telemetria-sync`/`email-sync` (as funções de cron, que usam a service role key) exigem o cabeçalho `x-cron-secret` — a chave anon/publishable sozinha (pública, embutida no HTML) não chega para as chamar, ao contrário do que acontecia antes desta correcção.
- Credenciais de integrações (Supabase, Resend, telemetria, Microsoft Graph, IMAP) só em variáveis de ambiente/segredos — nunca no código.
- Funções chamadas pelo browser com cabeçalho `Authorization` custom exigem tratamento explícito de CORS/preflight (`_shared/cors.ts`) — o Supabase não adiciona isto automaticamente.
- HTTPS em todos os pedidos.
