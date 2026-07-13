// ── CONFIGURAÇÃO SUPABASE ─────────────────────────────────────────
const SUPABASE_URL = 'https://yvnopdrsnhmfhikioots.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2bm9wZHJzbmhtZmhpa2lvb3RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MDA3MzQsImV4cCI6MjA5OTE3NjczNH0.Wg_Mk2IJq56MwOTg2i4cvTbx7YlO4eEY122nCJJ9OK4';
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
