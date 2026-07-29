// ── CONFIGURAÇÃO SUPABASE ─────────────────────────────────────────
// Chaves injectadas pelo servidor via variáveis de ambiente
const SUPABASE_URL = window.__SUPABASE_URL__;
const SUPABASE_KEY = window.__SUPABASE_KEY__;
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── PALETA DE CORES ───────────────────────────────────────────────
// Só os gráficos circulares (donut) usam esta paleta categórica — ordem fixa
// (não trocar). Tons desaturados/terrosos, a condizer com o vermelho da marca
// e os cinzentos do resto da app — sem magenta/aqua/verde-néon "genéricos".
// O vermelho fica de fora de propósito: é reservado para alertas/marca.
const COLORS = [
  '#4f7396',  // azul-aço (igual ao CHART_NEUTRAL)
  '#5f8f62',  // verde salva
  '#c2a13f',  // dourado
  '#a35c3f',  // terracota
  '#4a8a86',  // verde-azulado
  '#8a5a75',  // ameixa
  '#6b6f7a',  // grafite
  '#5f5a8a',  // índigo
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
