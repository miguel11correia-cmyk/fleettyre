// ── CONFIGURAÇÃO SUPABASE ─────────────────────────────────────────
// Chaves injectadas pelo servidor via variáveis de ambiente
const SUPABASE_URL = window.__SUPABASE_URL__;
const SUPABASE_KEY = window.__SUPABASE_KEY__;
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── PALETA DE CORES ───────────────────────────────────────────────
// Só os gráficos circulares (donut) usam esta paleta categórica — ordem fixa,
// validada para distinção em daltonismo. Não trocar a ordem dos tons.
const COLORS = [
  '#2a78d6',  // azul
  '#008300',  // verde
  '#e87ba4',  // magenta
  '#eda100',  // amarelo
  '#1baf7a',  // aqua
  '#eb6834',  // laranja
  '#4a3aa7',  // violeta
  '#e34948',  // vermelho
];

// Cor única para gráficos de barras/linha (não circulares) — sóbria de
// propósito (não distingue categorias), mas com um leve tom próprio em vez
// de cinzento puro, a condizer com o azul já usado na identidade da app.
const CHART_NEUTRAL = '#4f7396';

// ── ESTADO GLOBAL ─────────────────────────────────────────────────
let currentUser       = null;
let currentEmpresaId  = null;
let isAdmin           = false;
let painelId          = null;
let editId            = null;
let stockLinhaSelId   = null;
let stockDesmontadoSelId = null;
const charts          = {};
