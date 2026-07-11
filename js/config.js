// ── CONFIGURAÇÃO SUPABASE ─────────────────────────────────────────
const SUPABASE_URL = 'https://yvnopdrsnhmfhikioots.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2bm9wZHJzbmhtZmhpa2lvb3RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MDA3MzQsImV4cCI6MjA5OTE3NjczNH0.Wg_Mk2IJq56MwOTg2i4cvTbx7YlO4eEY122nCJJ9OK4';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── PALETA DE CORES ───────────────────────────────────────────────
const COLORS = [
  '#2a78d6','#1baf7a','#eda100','#4a3aa7',
  '#e34948','#e87ba4','#eb6834','#888780'
];

// ── ESTADO GLOBAL ─────────────────────────────────────────────────
let currentUser       = null;
let painelId          = null;
let editId            = null;
let stockLinhaSelId   = null;
let stockDesmontadoSelId = null;
let linhasFatura      = [];
let stockContexto     = 'veiculos';
const charts          = {};
