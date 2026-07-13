// ── CONFIGURAÇÃO SUPABASE ─────────────────────────────────────────
// Chaves injectadas pelo servidor via variáveis de ambiente
const SUPABASE_URL = window.__SUPABASE_URL__;
const SUPABASE_KEY = window.__SUPABASE_KEY__;
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── PALETA DE CORES ───────────────────────────────────────────────
const COLORS = [
  '#9b1c1c',  // vermelho marca
  '#1d4ed8',  // azul profundo
  '#15803d',  // verde floresta
  '#b45309',  // âmbar queimado
  '#0f766e',  // teal
  '#6d28d9',  // violeta
  '#475569',  // slate
  '#92400e',  // castanho
];

// ── ESTADO GLOBAL ─────────────────────────────────────────────────
let currentUser       = null;
let painelId          = null;
let editId            = null;
let stockLinhaSelId   = null;
let stockDesmontadoSelId = null;
const charts          = {};
