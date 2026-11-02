// ── CONFIGURAÇÃO SUPABASE ─────────────────────────────────────────
// Chaves injectadas pelo servidor via variáveis de ambiente
const SUPABASE_URL = window.__SUPABASE_URL__;
const SUPABASE_KEY = window.__SUPABASE_KEY__;
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── PALETA DE CORES ───────────────────────────────────────────────
// Todos os gráficos usam só o vermelho da marca FleetTyre (igual ao
// --brand-red do CSS, Manual de Identidade v1.0) — sem paleta categórica
// à parte. Como cada barra tem sempre o seu próprio rótulo (ver
// mkChart/topLabels), não é preciso uma cor diferente por categoria.
const CHART_NEUTRAL = '#E7101A';

// ── ESTADO GLOBAL ─────────────────────────────────────────────────
let currentUser       = null;
let currentEmpresaId  = null;
let isAdmin           = false;
let painelId          = null;
let editId            = null;
let stockLinhaSelId   = null;
let stockDesmontadoSelId = null;
const charts          = {};
