// ── CONFIGURAÇÃO SUPABASE ─────────────────────────────────────────
// Chaves injectadas pelo servidor via variáveis de ambiente
const SUPABASE_URL = window.__SUPABASE_URL__;
const SUPABASE_KEY = window.__SUPABASE_KEY__;
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── PALETA DE CORES ───────────────────────────────────────────────
// Todos os gráficos usam a cor de apoio da marca (Aço, igual ao
// --text2 do CSS) — o vermelho é só um acento no manual ("quando
// ocupa mais de um décimo da peça, deixa de destacar e passa a
// gritar"), por isso não enche barras inteiras. Como cada barra tem
// sempre o seu próprio rótulo (ver mkChart/topLabels), também não é
// preciso uma cor diferente por categoria para se distinguirem.
const CHART_NEUTRAL = '#5B6770';

// ── ESTADO GLOBAL ─────────────────────────────────────────────────
let currentUser       = null;
let currentEmpresaId  = null;
let isAdmin           = false;
let painelId          = null;
let editId            = null;
let stockLinhaSelId   = null;
let stockDesmontadoSelId = null;
const charts          = {};
