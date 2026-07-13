// ── CONFIGURAÇÃO SUPABASE ─────────────────────────────────────────
const SUPABASE_URL = 'https://yvnopdrsnhmfhikioots.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2bm9wZHJzbmhtZmhpa2lvb3RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MDA3MzQsImV4cCI6MjA5OTE3NjczNH0.Wg_Mk2IJq56MwOTg2i4cvTbx7YlO4eEY122nCJJ9OK4';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── PALETA DE CORES ───────────────────────────────────────────────
const COLORS = [
  '#4a7c59',  // verde sálvia
  '#5b7fa6',  // azul acinzentado
  '#8c6d3f',  // castanho dourado
  '#6b7280',  // cinzento neutro
  '#7c6f9b',  // violeta suave
  '#5f8a8b',  // teal suave
  '#9b7e6b',  // terracotta suave
  '#6b8e6e',  // verde musgo
];

// ── ESTADO GLOBAL ─────────────────────────────────────────────────
let currentUser       = null;
let painelId          = null;
let editId            = null;
let stockLinhaSelId   = null;
let stockDesmontadoSelId = null;
const charts          = {};
