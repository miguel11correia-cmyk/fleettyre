/* ══════════════════════════════════════════════════════════════════
   FleetTyre — app.js
   Requer: Supabase JS v2, Chart.js 4
   Configuração: substituir SUPABASE_URL e SUPABASE_ANON_KEY abaixo
   ══════════════════════════════════════════════════════════════════ */

// ── CONFIGURAÇÃO SUPABASE ─────────────────────────────────────────
// Substitui estes valores pelos do teu projecto em supabase.com
const SUPABASE_URL  = 'https://yvnopdrsnhmfhikioots.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2bm9wZHJzbmhtZmhpa2lvb3RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MDA3MzQsImV4cCI6MjA5OTE3NjczNH0.Wg_Mk2IJq56MwOTg2i4cvTbx7YlO4eEY122nCJJ9OK4';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── PALETA DE CORES (8 categorias) ───────────────────────────────
const COLORS = [
  '#2a78d6','#1baf7a','#eda100','#4a3aa7',
  '#e34948','#e87ba4','#eb6834','#888780'
];

// ── ESTADO GLOBAL ─────────────────────────────────────────────────
let currentUser = null;
let painelId    = null;       // id do registo a desmontar
const charts    = {};         // instâncias Chart.js activas

// ── UTILS ─────────────────────────────────────────────────────────

/** Formata número com separador PT */
function fmt(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('pt-PT');
}

/** Formata euro */
function fmtEur(n) {
  if (n == null || n === '') return '—';
  return '€\u202f' + Number(n).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Badge HTML por tipo de pneu */
function tipoBadge(t) {
  if (!t) return '';
  if (t === 'Novo')        return `<span class="badge b-novo">Novo</span>`;
  if (t === 'Remix')       return `<span class="badge b-remix">Remix</span>`;
  if (t === 'Piso Aberto') return `<span class="badge b-piso">Piso Aberto</span>`;
  return `<span class="badge">${t}</span>`;
}

/** Contagem dinâmica por campo */
function countBy(arr, key) {
  return arr.reduce((m, r) => {
    const k = r[key] || '(sem registo)';
    m[k] = (m[k] || 0) + 1;
    return m;
  }, {});
}

/** HTML da legenda */
function makeLegend(labels, colors) {
  return labels
    .map((l, i) => `<span><span class="lsq" style="background:${colors[i % colors.length]}"></span>${l}</span>`)
    .join('');
}

/** Escultura inicial por tipo */
function escIni(tipo) {
  if (tipo === 'Remix')       return 14;
  if (tipo === 'Piso Aberto') return 12;
  return 16; // Novo ou desconhecido
}

/**
 * Calcula taxa de desgaste em mm/1000km
 * Só para registos com kms_desmont, kms_mont e escultura_final válida (0–20mm)
 */
function taxaDesgaste(r) {
  const kmsEf = (r.kms_desmont || 0) - (r.kms_mont || 0);
  if (kmsEf <= 0) return null;
  const efinal = r.escultura_final;
  if (efinal == null || efinal < 0 || efinal > 20) return null;
  const eini = escIni(r.tipo);
  const desgaste = eini - efinal;
  if (desgaste < 0) return null; // dados incoerentes
  return (desgaste / kmsEf) * 1000;
}

/** Mostra/esconde overlay de loading */
function loading(show) {
  document.getElementById('loading').classList.toggle('hidden', !show);
}

/** Mostra feedback numa div */
function showFeedback(id, msg, isError = false) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = 'feedback ' + (isError ? 'error' : 'success');
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3500);
}

/** Destrói e recria um gráfico */
function mkChart(id, type, labels, data, colors, extraOpts = {}) {
  if (charts[id]) { charts[id].destroy(); }
  const el = document.getElementById(id);
  if (!el) return;
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const gridC  = isDark ? '#2c2c2a' : '#e5e4df';
  const tickC  = isDark ? '#898781' : '#8a8884';

  const baseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
  };

  const scalesBar = {
    x: { grid: { color: gridC }, ticks: { color: tickC, font: { size: 10 }, maxRotation: 40, autoSkip: false } },
    y: { grid: { color: gridC }, ticks: { color: tickC, font: { size: 10 } } },
  };
  const scalesBarH = {
    x: { grid: { color: gridC }, ticks: { color: tickC, font: { size: 10 } } },
    y: { grid: { display: false }, ticks: { color: tickC, font: { size: 10 } } },
  };

  let opts = { ...baseOpts };
  if (type === 'bar')   opts.scales = extraOpts.indexAxis === 'y' ? scalesBarH : scalesBar;
  if (type === 'doughnut') opts.cutout = '62%';

  charts[id] = new Chart(el, {
    type,
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 0,
        borderRadius: type === 'bar' ? 4 : 0,
      }],
    },
    options: { ...opts, ...extraOpts },
  });
}

// ── AUTH ──────────────────────────────────────────────────────────

async function login() {
  const email = document.getElementById('l-email').value.trim();
  const pass  = document.getElementById('l-pass').value;
  if (!email || !pass) {
    document.getElementById('l-err').textContent = 'Preenche email e password.';
    return;
  }
  loading(true);
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  loading(false);
  if (error) {
    document.getElementById('l-err').textContent = 'Credenciais inválidas.';
    return;
  }
  currentUser = data.user;
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('user-email').textContent = currentUser.email;
  await loadDashboard();
}

async function logout() {
  await sb.auth.signOut();
  currentUser = null;
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('l-pass').value = '';
}

// Verificar sessão ao carregar a página
window.addEventListener('load', async () => {
  const { data } = await sb.auth.getSession();
  if (data.session) {
    currentUser = data.session.user;
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('user-email').textContent = currentUser.email;
    await loadDashboard();
  }
});

// ── NAVEGAÇÃO ─────────────────────────────────────────────────────

function nav(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.remove('hidden');
  el.classList.add('active');
  fecharPainel();

  // Carregar dados da página activa
  if (id === 'dashboard')    loadDashboard();
  else if (id === 'frota')   initFrotaSelect();
  else if (id === 'alertas') loadAlertas();
  else if (id === 'fornecedores') loadFornecedores();
  else if (id === 'marcas')  loadMarcas();
  else if (id === 'stock')   loadStock();
}

// ── DASHBOARD ─────────────────────────────────────────────────────

async function loadDashboard() {
  loading(true);
  const { data, error } = await sb
    .from('pneus')
    .select('*')
    .order('mes_mont', { ascending: true });
  loading(false);

  if (error) { console.error(error); return; }
  if (!data || data.length === 0) {
    document.getElementById('k-activos').textContent = '0';
    document.getElementById('k-total').textContent   = '0';
    document.getElementById('k-mats').textContent    = '0';
    document.getElementById('k-alerts').textContent  = '0';
    document.getElementById('k-custo').textContent   = '—';
    document.getElementById('k-med').textContent     = '—';
    return;
  }

  const activos  = data.filter(r => !r.mes_desmont).length;
  const mats     = [...new Set(data.map(r => r.matricula))].length;
  const alertas  = data.filter(r =>
    r.escultura_final != null &&
    r.escultura_final >= 0 &&
    r.escultura_final <= 3
  ).length;

  // Custo total — só registos com custo_pneu preenchido
  const comCusto = data.filter(r => r.custo_pneu != null && r.custo_pneu > 0);
  const custoTotal = comCusto.reduce((s, r) => s + Number(r.custo_pneu), 0);
  const custoMed   = comCusto.length > 0 ? custoTotal / comCusto.length : null;

  document.getElementById('k-activos').textContent = activos;
  document.getElementById('k-total').textContent   = data.length;
  document.getElementById('k-mats').textContent    = mats;
  document.getElementById('k-alerts').textContent  = alertas;
  document.getElementById('k-custo').textContent   = custoTotal > 0 ? fmtEur(custoTotal) : '—';
  document.getElementById('k-med').textContent     = custoMed   ? fmtEur(custoMed)   : '—';

  // Badge alertas no menu
  const badge = document.getElementById('badge-alertas');
  badge.textContent = alertas;
  badge.classList.toggle('hidden', alertas === 0);

  // ── Gráfico tipo ──
  const tipos   = countBy(data, 'tipo');
  const tLabels = Object.keys(tipos);
  const tColors = tLabels.map(l =>
    l === 'Novo' ? '#0ca30c' : l === 'Remix' ? '#2a78d6' : '#eda100'
  );
  document.getElementById('leg-tipo').innerHTML = makeLegend(tLabels, tColors);
  mkChart('c-tipo', 'doughnut', tLabels, tLabels.map(k => tipos[k]), tColors);

  // ── Gráfico fornecedor ──
  const forns   = countBy(data, 'fornecedor');
  const fKeys   = Object.keys(forns).sort((a, b) => forns[b] - forns[a]).slice(0, 8);
  document.getElementById('leg-forn').innerHTML = makeLegend(fKeys, COLORS);
  mkChart('c-forn', 'doughnut', fKeys, fKeys.map(k => forns[k]), COLORS.slice(0, fKeys.length));

  // ── Gráfico marca ──
  const marcs   = countBy(data.filter(r => r.marca), 'marca');
  const mKeys   = Object.keys(marcs).sort((a, b) => marcs[b] - marcs[a]);
  document.getElementById('leg-marc').innerHTML = makeLegend(mKeys, COLORS);
  mkChart('c-marc', 'doughnut', mKeys, mKeys.map(k => marcs[k]), COLORS.slice(0, mKeys.length));

  // ── Top veículos ──
  const byMat   = countBy(data, 'matricula');
  const topMats = Object.keys(byMat).sort((a, b) => byMat[b] - byMat[a]).slice(0, 10);
  mkChart('c-top', 'bar', topMats, topMats.map(m => byMat[m]), COLORS, {
    indexAxis: 'y',
    scales: {
      x: { grid: { color: '#e5e4df' }, ticks: { color: '#8a8884', font: { size: 10 } } },
      y: { grid: { display: false },   ticks: { color: '#8a8884', font: { size: 10 } } },
    },
  });
}

// ── REGISTAR ──────────────────────────────────────────────────────

async function guardarRegisto() {
  const mat    = document.getElementById('r-mat').value.trim().toUpperCase();
  const mes    = document.getElementById('r-mes').value.trim();
  const kmsStr = document.getElementById('r-kms').value;
  const pos    = document.getElementById('r-pos').value.trim().toUpperCase();
  const marca  = document.getElementById('r-marca').value.trim().toUpperCase();
  const medida = document.getElementById('r-medida').value.trim();
  const tipo   = document.getElementById('r-tipo').value;
  const forn   = document.getElementById('r-forn').value.trim().toUpperCase();
  const matPneu= document.getElementById('r-matpneu').value.trim().toUpperCase();
  const custoP = parseFloat(document.getElementById('r-custo').value) || null;
  const custoMO= parseFloat(document.getElementById('r-mo').value)    || null;

  // Validações
  if (!mat) { showFeedback('r-feedback', 'Matrícula do camião é obrigatória.', true); return; }
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) { showFeedback('r-feedback', 'Mês inválido. Usa o formato AAAA-MM.', true); return; }
  const kms = parseInt(kmsStr);
  if (!kms || kms <= 0) { showFeedback('r-feedback', 'KMs do conta-quilómetros é obrigatório.', true); return; }

  const custoTotal = (custoP || 0) + (custoMO || 0);

  const registo = {
    matricula:   mat,
    mes_mont:    mes,
    kms_mont:    kms,
    posicao:     pos || null,
    marca:       marca || null,
    medida:      medida || null,
    tipo:        tipo || null,
    fornecedor:  forn || null,
    mat_pneu:    matPneu || null,
    custo_pneu:  custoP,
    custo_mo:    custoMO,
    custo_total: custoTotal > 0 ? custoTotal : null,
    // Campos desmontagem inicialmente nulos
    mes_desmont:     null,
    kms_desmont:     null,
    escultura_final: null,
    destino:         null,
  };

  loading(true);
  const { error } = await sb.from('pneus').insert([registo]);
  loading(false);

  if (error) {
    showFeedback('r-feedback', 'Erro ao guardar: ' + error.message, true);
    return;
  }
  // Descontar stock se foi seleccionado
  if (stockLinhaSelId) {
    await descontarStock(stockLinhaSelId);
    stockLinhaSelId = null;
  }
  showFeedback('r-feedback', 'Montagem guardada com sucesso.');
  limparForm();
}

function limparForm() {
  ['r-mat','r-mes','r-kms','r-pos','r-marca','r-medida','r-forn','r-matpneu','r-custo','r-mo']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('r-tipo').value = 'Novo';
  stockLinhaSelId = null;
  const info = document.getElementById('r-stock-info');
  if (info) info.classList.add('hidden');
}

// ── POR MATRÍCULA ─────────────────────────────────────────────────

async function initFrotaSelect() {
  loading(true);
  const { data, error } = await sb
    .from('pneus')
    .select('matricula')
    .order('matricula');
  loading(false);

  if (error || !data) return;

  const mats = [...new Set(data.map(r => r.matricula))].sort();
  const sel  = document.getElementById('sel-mat');
  const prev = sel.value;
  sel.innerHTML = mats.map(m => `<option value="${m}"${m === prev ? ' selected' : ''}>${m}</option>`).join('');

  if (mats.length > 0) await loadFrota();
}

async function loadFrota() {
  const mat = document.getElementById('sel-mat').value;
  if (!mat) return;

  loading(true);
  const { data, error } = await sb
    .from('pneus')
    .select('*')
    .eq('matricula', mat)
    .order('mes_mont', { ascending: true });
  loading(false);

  if (error || !data) return;

  // ── KPIs da matrícula ──
  const activos   = data.filter(r => !r.mes_desmont).length;
  const comKms    = data.filter(r => r.kms_desmont && r.kms_mont && r.kms_desmont > r.kms_mont);
  const kmsEfArr  = comKms.map(r => r.kms_desmont - r.kms_mont);
  const kmsmedios = kmsEfArr.length > 0
    ? Math.round(kmsEfArr.reduce((s, v) => s + v, 0) / kmsEfArr.length)
    : null;

  const comCusto   = data.filter(r => r.custo_pneu != null && r.custo_pneu > 0);
  const custoTotal = comCusto.reduce((s, r) => s + Number(r.custo_pneu), 0);
  const custoMed   = comCusto.length > 0 ? custoTotal / comCusto.length : null;

  // €/km = custo médio por pneu ÷ KMs médios por pneu
  const eurKm = (custoMed && kmsmedios && kmsmedios > 0)
    ? (custoMed / kmsmedios).toFixed(4)
    : null;

  document.getElementById('fk1').textContent = data.length;
  document.getElementById('fk2').textContent = activos;
  document.getElementById('fk3').textContent = kmsmedios ? fmt(kmsmedios) : '—';
  document.getElementById('fk4').textContent = custoTotal > 0 ? fmtEur(custoTotal) : '—';
  document.getElementById('fk5').textContent = custoMed   ? fmtEur(custoMed)   : '—';
  document.getElementById('fk6').textContent = eurKm      ? '€\u202f' + eurKm   : '—';

  // ── Tabela ──
  const tbody = document.getElementById('frota-tbody');
  tbody.innerHTML = data.map(r => {
    const kmsEf = (r.kms_desmont && r.kms_mont && r.kms_desmont > r.kms_mont)
      ? fmt(r.kms_desmont - r.kms_mont) : '—';
    const esc   = r.escultura_final != null ? r.escultura_final + '\u202fmm' : '—';
    const escCls= (r.escultura_final != null && r.escultura_final <= 3) ? 'badge b-alert' : '';
    const custoTot = (r.custo_pneu || 0) + (r.custo_mo || 0);
    const acBtn = `<div style="display:flex;gap:4px">
        ${!r.mes_desmont ? `<button class="btn btn-s" onclick="abrirPainel(${r.id})">🔧 Desmontar</button>` : '<span style="color:var(--text3);font-size:11px">✓</span>'}
        <button class="btn btn-sm" onclick="abrirEdicao(${r.id})" style="height:28px;padding:0 8px;font-size:11px">✏️</button>
      </div>`;
    return `<tr>
      <td>${r.mes_mont || '—'}</td>
      <td>${r.posicao  || '—'}</td>
      <td>${r.marca    || '—'}</td>
      <td>${r.medida   || '—'}</td>
      <td>${tipoBadge(r.tipo)}</td>
      <td style="text-align:right">${fmt(r.kms_mont)}</td>
      <td>${r.mes_desmont || '—'}</td>
      <td style="text-align:right">${r.kms_desmont ? fmt(r.kms_desmont) : '—'}</td>
      <td style="text-align:right">${kmsEf}</td>
      <td><span class="${escCls}">${esc}</span></td>
      <td>${r.destino  || '—'}</td>
      <td style="text-align:right">${r.custo_pneu != null ? fmtEur(r.custo_pneu) : '—'}</td>
      <td style="text-align:right">${r.custo_mo   != null ? fmtEur(r.custo_mo)   : '—'}</td>
      <td style="text-align:right">${custoTot > 0 ? fmtEur(custoTot) : '—'}</td>
      <td>${acBtn}</td>
    </tr>`;
  }).join('');
}

// ── PAINEL DESMONTAGEM ────────────────────────────────────────────

async function abrirPainel(id) {
  // Buscar registo para mostrar info
  const { data } = await sb.from('pneus').select('*').eq('id', id).single();
  if (!data) return;
  painelId = id;

  document.getElementById('painel-info').innerHTML =
    `<strong>${data.matricula}</strong> · ${data.posicao || '—'} · ${data.marca || '—'} ${data.medida || ''}<br>
     <span style="color:var(--text2)">Montagem: ${data.mes_mont} · KMs montagem: ${fmt(data.kms_mont)}</span>`;

  // Limpar campos
  ['d-mes','d-kms','d-esc','d-mo'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('d-dest').value = 'Remix';
  document.getElementById('d-feedback').classList.add('hidden');
  document.getElementById('painel').classList.add('open');
}

function fecharPainel() {
  document.getElementById('painel').classList.remove('open');
  painelId = null;
}

async function guardarDesmontagem() {
  if (painelId == null) return;

  const mes    = document.getElementById('d-mes').value.trim();
  const kmsStr = document.getElementById('d-kms').value;
  const escStr = document.getElementById('d-esc').value;
  const dest   = document.getElementById('d-dest').value;
  const moStr  = document.getElementById('d-mo').value;

  // Validações
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    showFeedback('d-feedback', 'Mês inválido. Usa AAAA-MM.', true); return;
  }
  const kms = parseInt(kmsStr);
  if (!kms || kms <= 0) {
    showFeedback('d-feedback', 'KMs são obrigatórios.', true); return;
  }

  // Buscar registo original para validar KMs
  const { data: orig } = await sb.from('pneus').select('kms_mont, tipo, custo_pneu').eq('id', painelId).single();
  if (orig && orig.kms_mont && kms <= orig.kms_mont) {
    showFeedback('d-feedback', `KMs de desmontagem (${fmt(kms)}) têm de ser maiores que os de montagem (${fmt(orig.kms_mont)}).`, true);
    return;
  }

  const esc  = escStr !== '' ? parseFloat(escStr) : null;
  const mo   = moStr  !== '' ? parseFloat(moStr)  : null;

  // Custo total = custo pneu (já existente) + mão obra desmontagem
  const custoTotalUpd = ((orig?.custo_pneu || 0) + (mo || 0)) || null;

  const updates = {
    mes_desmont:     mes,
    kms_desmont:     kms,
    escultura_final: (esc != null && esc >= 0 && esc <= 20) ? esc : null,
    destino:         dest,
    custo_mo:        mo,
    custo_total:     custoTotalUpd,
  };

  loading(true);
  const { error } = await sb.from('pneus').update(updates).eq('id', painelId);
  loading(false);

  if (error) {
    showFeedback('d-feedback', 'Erro: ' + error.message, true); return;
  }
  showFeedback('d-feedback', 'Desmontagem guardada.');
  setTimeout(() => {
    fecharPainel();
    loadFrota();
    loadDashboard();
  }, 800);
}

// ── ALERTAS ───────────────────────────────────────────────────────

/**
 * Calcula KMs médios por mês de uma matrícula
 * Usa o histórico de montagens para estimar ritmo de utilização
 * Lógica: para cada par de montagens consecutivas, calcula KMs/mês
 */
function kmsMediaMensal(registosMat) {
  // Ordenar por kms_mont
  const ordenados = [...registosMat]
    .filter(r => r.kms_mont)
    .sort((a, b) => a.kms_mont - b.kms_mont);

  if (ordenados.length < 2) {
    // Só um registo — usar diferença entre montagem e hoje
    const r = ordenados[0];
    if (!r) return null;
    const mesesPassados = mesesEntre(r.mes_mont, mesAtual());
    if (mesesPassados <= 0) return null;
    // Estimativa conservadora: 8000km/mês (média sector pesados PT)
    return 8000;
  }

  // Calcular KMs/mês entre montagens consecutivas
  const taxas = [];
  for (let i = 1; i < ordenados.length; i++) {
    const kmsDif = ordenados[i].kms_mont - ordenados[i-1].kms_mont;
    const mesesDif = mesesEntre(ordenados[i-1].mes_mont, ordenados[i].mes_mont);
    if (kmsDif > 0 && mesesDif > 0) {
      taxas.push(kmsDif / mesesDif);
    }
  }

  if (taxas.length === 0) return 8000; // fallback

  // Média das taxas, excluindo outliers extremos (< 500 ou > 30000 km/mês)
  const validas = taxas.filter(t => t >= 500 && t <= 30000);
  if (validas.length === 0) return 8000;
  return validas.reduce((s, v) => s + v, 0) / validas.length;
}

/** Calcula meses entre dois meses no formato AAAA-MM */
function mesesEntre(mesInicio, mesFim) {
  if (!mesInicio || !mesFim) return 0;
  const [aI, mI] = mesInicio.split('-').map(Number);
  const [aF, mF] = mesFim.split('-').map(Number);
  return (aF - aI) * 12 + (mF - mI);
}

/** Retorna mês actual no formato AAAA-MM */
function mesAtual() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Calcula taxa de desgaste média por marca+tipo
 * a partir dos registos históricos com escultura final válida
 */
function calcularTaxasPorMarcaTipo(dados) {
  const taxas = {};
  dados.forEach(r => {
    const t = taxaDesgaste(r);
    if (t === null) return;
    const chave = `${r.marca || 'DESCONHECIDA'}|${r.tipo || 'Novo'}`;
    if (!taxas[chave]) taxas[chave] = [];
    taxas[chave].push(t);
  });

  // Média por chave
  const medias = {};
  Object.keys(taxas).forEach(k => {
    const arr = taxas[k];
    medias[k] = arr.reduce((s, v) => s + v, 0) / arr.length;
  });
  return medias;
}

/**
 * Taxa de desgaste para um pneu activo:
 * 1. Tenta usar taxa da mesma marca+tipo
 * 2. Fallback: taxa média da mesma marca (qualquer tipo)
 * 3. Fallback: taxa média geral
 * 4. Fallback: valor padrão do sector (0.08 mm/1000km)
 */
function taxaEstimada(r, taxasPorMarcaTipo, todasTaxas) {
  const chave = `${r.marca || 'DESCONHECIDA'}|${r.tipo || 'Novo'}`;
  if (taxasPorMarcaTipo[chave]) return taxasPorMarcaTipo[chave];

  // Fallback: mesma marca, qualquer tipo
  const chavesMarca = Object.keys(taxasPorMarcaTipo).filter(k => k.startsWith((r.marca || 'DESCONHECIDA') + '|'));
  if (chavesMarca.length > 0) {
    const vals = chavesMarca.map(k => taxasPorMarcaTipo[k]);
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  }

  // Fallback: média geral
  if (todasTaxas.length > 0) {
    return todasTaxas.reduce((s, v) => s + v, 0) / todasTaxas.length;
  }

  // Fallback padrão sector pesados
  return 0.08;
}

async function loadAlertas() {
  loading(true);
  const { data, error } = await sb.from('pneus').select('*');
  loading(false);
  if (error || !data) return;

  const hoje = mesAtual();

  // ── 1. Calcular taxas de desgaste a partir do histórico ──
  const taxasPorMarcaTipo = calcularTaxasPorMarcaTipo(data);
  const todasTaxas = data.map(r => taxaDesgaste(r)).filter(t => t !== null);

  // ── 2. Agrupar registos por matrícula para calcular KMs/mês ──
  const porMat = {};
  data.forEach(r => {
    if (!porMat[r.matricula]) porMat[r.matricula] = [];
    porMat[r.matricula].push(r);
  });

  // ── 3. Para cada pneu ACTIVO, estimar escultura actual ──
  const estimativas = [];
  const activos = data.filter(r => !r.mes_desmont && r.mes_mont);

  activos.forEach(r => {
    const mesesDecorridos = mesesEntre(r.mes_mont, hoje);
    if (mesesDecorridos < 0) return;

    const kmsMes = kmsMediaMensal(porMat[r.matricula] || [r]);
    const kmsEstimados = mesesDecorridos * kmsMes;
    const taxa = taxaEstimada(r, taxasPorMarcaTipo, todasTaxas);
    const escInicial = escIni(r.tipo);
    const escEstimada = escInicial - (kmsEstimados / 1000 * taxa);

    estimativas.push({
      ...r,
      mesesDecorridos,
      kmsEstimados: Math.round(kmsEstimados),
      kmsMes: Math.round(kmsMes),
      taxa: taxa,
      escEstimada: Math.max(0, Math.round(escEstimada * 10) / 10),
    });
  });

  // Ordenar por escultura estimada (mais urgente primeiro)
  estimativas.sort((a, b) => a.escEstimada - b.escEstimada);

  // ── 4. Alertas críticos (escultura estimada ≤ 3mm) ──
  const criticos = estimativas.filter(r => r.escEstimada <= 3);
  const aviso    = estimativas.filter(r => r.escEstimada > 3 && r.escEstimada <= 5);

  // Actualizar badge no menu
  const badge = document.getElementById('badge-alertas');
  badge.textContent = criticos.length;
  badge.classList.toggle('hidden', criticos.length === 0);
  document.getElementById('k-alerts').textContent = criticos.length;

  // ── 5. Renderizar alertas críticos ──
  const list = document.getElementById('alertas-list');
  if (criticos.length === 0) {
    list.innerHTML = '<p class="empty-msg">Nenhum pneu activo com escultura estimada ≤ 3mm.</p>';
  } else {
    list.innerHTML = criticos.map(r => {
      const pct = Math.max(3, Math.round((r.escEstimada / escIni(r.tipo)) * 100));
      const cor = r.escEstimada <= 1 ? '#c93030' : r.escEstimada <= 2 ? '#c47b0a' : '#e34948';
      return `<div class="alerta-row">
        <div class="alerta-info">
          <span class="alerta-mat">${r.matricula} — ${r.posicao || '—'}</span>
          <span class="alerta-det">${r.marca || '—'} ${r.medida || ''} · ${r.tipo || '—'} · Mont.: ${r.mes_mont} · ~${fmt(r.kmsEstimados)} km estimados</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="prog"><div class="prog-fill" style="width:${pct}%;background:${cor}"></div></div>
          <span class="badge b-alert">~${r.escEstimada} mm</span>
        </div>
      </div>`;
    }).join('');
  }

  // ── 6. Tabela completa de estimativas (todos os activos) ──
  const tbody = document.getElementById('desgaste-tbody');
  if (estimativas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-msg" style="text-align:center;padding:12px">Sem pneus activos para estimar.</td></tr>';
  } else {
    tbody.innerHTML = estimativas.map(r => {
      const escCls = r.escEstimada <= 3 ? 'badge b-alert' :
                     r.escEstimada <= 5 ? 'badge b-warn'  : '';
      return `<tr>
        <td>${r.matricula}</td>
        <td>${r.posicao || '—'}</td>
        <td>${r.marca   || '—'}</td>
        <td>${tipoBadge(r.tipo)}</td>
        <td style="text-align:right">${r.mes_mont}</td>
        <td style="text-align:right">${fmt(r.kmsEstimados)}</td>
        <td style="text-align:right">${r.taxa.toFixed(3)} mm/1000km</td>
        <td><span class="${escCls}">${r.escEstimada} mm</span></td>
      </tr>`;
    }).join('');
  }

  // ── 7. Secção de avisos (3-5mm) ──
  const avisoDiv = document.getElementById('alertas-aviso');
  if (avisoDiv) {
    if (aviso.length === 0) {
      avisoDiv.innerHTML = '<p class="empty-msg">Nenhum pneu activo com escultura estimada entre 3 e 5mm.</p>';
    } else {
      avisoDiv.innerHTML = aviso.map(r => `<div class="alerta-row">
        <div class="alerta-info">
          <span class="alerta-mat">${r.matricula} — ${r.posicao || '—'}</span>
          <span class="alerta-det">${r.marca || '—'} ${r.medida || ''} · ${r.tipo || '—'} · Mont.: ${r.mes_mont}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="prog"><div class="prog-fill" style="width:${Math.round(r.escEstimada/escIni(r.tipo)*100)}%;background:#c47b0a"></div></div>
          <span class="badge b-warn">~${r.escEstimada} mm</span>
        </div>
      </div>`).join('');
    }
  }

  // ── 8. Tabela de taxas históricas usadas ──
  const tbody2 = document.getElementById('escultura-tbody');
  const comDesgaste = data.filter(r => taxaDesgaste(r) !== null);
  if (tbody2) {
    if (comDesgaste.length === 0) {
      tbody2.innerHTML = '<tr><td colspan="7" class="empty-msg" style="text-align:center;padding:12px">Sem registos históricos com escultura final ainda.</td></tr>';
    } else {
      tbody2.innerHTML = comDesgaste.map(r => {
        const taxa = taxaDesgaste(r).toFixed(3);
        const kmsEf = r.kms_desmont - r.kms_mont;
        return `<tr>
          <td>${r.matricula}</td>
          <td>${r.posicao || '—'}</td>
          <td>${r.marca   || '—'}</td>
          <td>${tipoBadge(r.tipo)}</td>
          <td style="text-align:right">${fmt(kmsEf)}</td>
          <td style="text-align:right">${r.escultura_final} mm</td>
          <td style="text-align:right">${taxa} mm/1000km</td>
        </tr>`;
      }).join('');
    }
  }
}

// ── FORNECEDORES ──────────────────────────────────────────────────

async function loadFornecedores() {
  loading(true);
  const { data, error } = await sb.from('pneus').select('*');
  loading(false);
  if (error || !data) return;

  // Agregar dinamicamente por fornecedor
  const agg = {};
  data.forEach(r => {
    const k = r.fornecedor || '(sem registo)';
    if (!agg[k]) agg[k] = { total: 0, novo: 0, remix: 0, piso: 0, comCusto: 0, custo: 0 };
    agg[k].total++;
    if (r.tipo === 'Novo')        agg[k].novo++;
    else if (r.tipo === 'Remix')  agg[k].remix++;
    else if (r.tipo === 'Piso Aberto') agg[k].piso++;
    if (r.custo_pneu != null && r.custo_pneu > 0) {
      agg[k].comCusto++;
      agg[k].custo += Number(r.custo_pneu);
    }
  });

  const keys = Object.keys(agg).sort((a, b) => agg[b].total - agg[a].total);

  document.getElementById('forn-tbody').innerHTML = keys.map(k => {
    const f   = agg[k];
    const med = f.comCusto > 0 ? fmtEur(f.custo / f.comCusto) : '—';
    return `<tr>
      <td><strong>${k}</strong></td>
      <td>${f.total}</td><td>${f.novo}</td><td>${f.remix}</td><td>${f.piso}</td>
      <td>${f.comCusto}</td>
      <td style="text-align:right">${f.custo > 0 ? fmtEur(f.custo) : '—'}</td>
      <td style="text-align:right">${med}</td>
    </tr>`;
  }).join('');

  // Gráfico volume
  document.getElementById('leg-forn2').innerHTML = makeLegend(keys, COLORS);
  mkChart('c-forn2', 'bar', keys, keys.map(k => agg[k].total), COLORS.slice(0, keys.length));

  // Gráfico custo médio — só fornecedores com custo registado
  const keysComCusto = keys.filter(k => agg[k].comCusto > 0);
  if (keysComCusto.length > 0) {
    mkChart('c-forn-custo', 'bar',
      keysComCusto,
      keysComCusto.map(k => Math.round(agg[k].custo / agg[k].comCusto)),
      COLORS.slice(0, keysComCusto.length)
    );
  }
}

// ── MARCAS ────────────────────────────────────────────────────────

async function loadMarcas() {
  loading(true);
  const { data, error } = await sb.from('pneus').select('*');
  loading(false);
  if (error || !data) return;

  // Agregar por marca (excluir marcas vazias)
  const agg = {};
  data.filter(r => r.marca).forEach(r => {
    const k = r.marca;
    if (!agg[k]) agg[k] = { total: 0, novo: 0, remix: 0, piso: 0, kmsArr: [], custos: [], taxas: [] };
    agg[k].total++;
    if (r.tipo === 'Novo')        agg[k].novo++;
    else if (r.tipo === 'Remix')  agg[k].remix++;
    else if (r.tipo === 'Piso Aberto') agg[k].piso++;

    // KMs efectuados (só registos com desmontagem e KMs coerentes)
    if (r.kms_desmont && r.kms_mont && r.kms_desmont > r.kms_mont) {
      agg[k].kmsArr.push(r.kms_desmont - r.kms_mont);
    }

    // Custo médio por pneu
    if (r.custo_pneu != null && r.custo_pneu > 0) {
      agg[k].custos.push(Number(r.custo_pneu));
    }

    // Taxa de desgaste
    const taxa = taxaDesgaste(r);
    if (taxa !== null) agg[k].taxas.push(taxa);
  });

  const keys = Object.keys(agg).sort((a, b) => agg[b].total - agg[a].total);

  document.getElementById('marc-tbody').innerHTML = keys.map(k => {
    const m = agg[k];
    const kmsM = m.kmsArr.length > 0
      ? fmt(Math.round(m.kmsArr.reduce((s, v) => s + v, 0) / m.kmsArr.length))
      : '—';
    const taxaM = m.taxas.length > 0
      ? (m.taxas.reduce((s, v) => s + v, 0) / m.taxas.length).toFixed(3) + '\u202fmm'
      : '—';
    const custoM = m.custos.length > 0
      ? fmtEur(m.custos.reduce((s, v) => s + v, 0) / m.custos.length)
      : '—';
    return `<tr>
      <td><strong>${k}</strong></td>
      <td>${m.total}</td><td>${m.novo}</td><td>${m.remix}</td><td>${m.piso}</td>
      <td style="text-align:right">${kmsM}</td>
      <td style="text-align:right">${taxaM}</td>
      <td style="text-align:right">${custoM}</td>
    </tr>`;
  }).join('');

  // Gráfico pizza marcas
  document.getElementById('leg-marc2').innerHTML = makeLegend(keys, COLORS);
  mkChart('c-marc2', 'doughnut', keys, keys.map(k => agg[k].total), COLORS.slice(0, keys.length));

  // Gráfico KMs médios — só marcas com dados
  const keysComKms = keys.filter(k => agg[k].kmsArr.length > 0);
  if (keysComKms.length > 0) {
    mkChart('c-marc-km', 'bar',
      keysComKms,
      keysComKms.map(k => Math.round(agg[k].kmsArr.reduce((s, v) => s + v, 0) / agg[k].kmsArr.length)),
      COLORS.slice(0, keysComKms.length)
    );
  }
}

// ── EDITAR REGISTO ────────────────────────────────────────────────

let editId = null;

async function abrirEdicao(id) {
  loading(true);
  const { data, error } = await sb.from('pneus').select('*').eq('id', id).single();
  loading(false);
  if (error || !data) return;

  editId = id;

  // Preencher painel de edição
  document.getElementById('e-mat').value     = data.matricula    || '';
  document.getElementById('e-mes').value     = data.mes_mont     || '';
  document.getElementById('e-kms').value     = data.kms_mont     || '';
  document.getElementById('e-pos').value     = data.posicao      || '';
  document.getElementById('e-marca').value   = data.marca        || '';
  document.getElementById('e-medida').value  = data.medida       || '';
  document.getElementById('e-tipo').value    = data.tipo         || 'Novo';
  document.getElementById('e-forn').value    = data.fornecedor   || '';
  document.getElementById('e-custo').value   = data.custo_pneu   != null ? data.custo_pneu : '';
  document.getElementById('e-mo').value      = data.custo_mo     != null ? data.custo_mo   : '';
  document.getElementById('e-mes-d').value   = data.mes_desmont  || '';
  document.getElementById('e-kms-d').value   = data.kms_desmont  || '';
  document.getElementById('e-esc').value     = data.escultura_final != null ? data.escultura_final : '';
  document.getElementById('e-dest').value    = data.destino      || '';

  document.getElementById('e-feedback').classList.add('hidden');
  document.getElementById('painel-editar').classList.add('open');
}

function fecharEdicao() {
  document.getElementById('painel-editar').classList.remove('open');
  editId = null;
}

async function guardarEdicao() {
  if (editId == null) return;

  const mat    = document.getElementById('e-mat').value.trim().toUpperCase();
  const mes    = document.getElementById('e-mes').value.trim();
  const kms    = parseInt(document.getElementById('e-kms').value) || null;
  const pos    = document.getElementById('e-pos').value.trim().toUpperCase();
  const marca  = document.getElementById('e-marca').value.trim().toUpperCase();
  const medida = document.getElementById('e-medida').value.trim();
  const tipo   = document.getElementById('e-tipo').value;
  const forn   = document.getElementById('e-forn').value.trim().toUpperCase();
  const custoP = document.getElementById('e-custo').value !== '' ? parseFloat(document.getElementById('e-custo').value) : null;
  const custoMO= document.getElementById('e-mo').value    !== '' ? parseFloat(document.getElementById('e-mo').value)    : null;
  const mesD   = document.getElementById('e-mes-d').value.trim() || null;
  const kmsD   = document.getElementById('e-kms-d').value !== '' ? parseInt(document.getElementById('e-kms-d').value) : null;
  const esc    = document.getElementById('e-esc').value   !== '' ? parseFloat(document.getElementById('e-esc').value)  : null;
  const dest   = document.getElementById('e-dest').value || null; // vazio = null

  // Validações básicas
  if (!mat) { showFeedback('e-feedback', 'Matrícula é obrigatória.', true); return; }
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) { showFeedback('e-feedback', 'Mês de montagem inválido. Usa AAAA-MM.', true); return; }
  if (!kms || kms <= 0) { showFeedback('e-feedback', 'KMs de montagem são obrigatórios.', true); return; }
  if (kmsD && kmsD <= kms) { showFeedback('e-feedback', `KMs de desmontagem (${kmsD}) têm de ser maiores que os de montagem (${kms}).`, true); return; }
  if (esc != null && (esc < 0 || esc > 25)) { showFeedback('e-feedback', 'Escultura tem de ser entre 0 e 25mm.', true); return; }

  const updates = {
    matricula:       mat,
    mes_mont:        mes,
    kms_mont:        kms,
    posicao:         pos    || null,
    marca:           marca  || null,
    medida:          medida || null,
    tipo:            tipo   || null,
    fornecedor:      forn   || null,
    custo_pneu:      custoP,
    custo_mo:        custoMO,
    mes_desmont:     mesD,
    kms_desmont:     kmsD,
    escultura_final: esc,
    destino:         dest,
  };

  loading(true);
  const { error } = await sb.from('pneus').update(updates).eq('id', editId);
  loading(false);

  if (error) { showFeedback('e-feedback', 'Erro: ' + error.message, true); return; }

  showFeedback('e-feedback', 'Registo actualizado.');
  setTimeout(() => { fecharEdicao(); loadFrota(); loadDashboard(); }, 800);
}

// ══════════════════════════════════════════════════════════════════
// STOCK
// ══════════════════════════════════════════════════════════════════

let linhasFatura = [];       // linhas temporárias ao criar fatura
let stockSelCallback = null; // função a chamar ao seleccionar pneu de stock
let stockLinhaSelId = null;  // id da linha de stock seleccionada no registo actual

// ── CARREGAR STOCK ─────────────────────────────────────────────────
async function loadStock() {
  loading(true);

  // Buscar faturas com pelo menos 1 linha com stock disponível
  const { data: faturas, error: errF } = await sb
    .from('stock_faturas')
    .select('*, stock_linhas(*)')
    .order('created_at', { ascending: false });

  loading(false);
  if (errF || !faturas) return;

  // Filtrar só faturas com pelo menos 1 linha com stock disponível
  const faturasAtivas = faturas.filter(f =>
    f.stock_linhas && f.stock_linhas.some(l => l.quantidade_disp > 0)
  );

  // KPIs
  let totalPneus = 0;
  let totalValor = 0;
  faturasAtivas.forEach(f => {
    f.stock_linhas.filter(l => l.quantidade_disp > 0).forEach(l => {
      totalPneus += l.quantidade_disp;
      totalValor += l.quantidade_disp * (l.preco_unitario || 0);
    });
  });

  document.getElementById('sk-faturas').textContent = faturasAtivas.length;
  document.getElementById('sk-pneus').textContent   = totalPneus;
  document.getElementById('sk-valor').textContent   = totalValor > 0 ? fmtEur(totalValor) : '—';

  // Renderizar faturas
  const container = document.getElementById('stock-faturas-container');
  if (faturasAtivas.length === 0) {
    container.innerHTML = '<div class="card"><p class="empty-msg">Sem stock disponível. Clica em "+ Nova fatura" para registar.</p></div>';
    return;
  }

  container.innerHTML = faturasAtivas.map(f => {
    const linhasDisp = f.stock_linhas.filter(l => l.quantidade_disp > 0);
    const totalFat   = linhasDisp.reduce((s, l) => s + l.quantidade_disp * (l.preco_unitario || 0), 0);

    const linhasHTML = linhasDisp.map(l => {
      const pct = Math.round((l.quantidade_disp / l.quantidade_ini) * 100);
      const cor = pct <= 25 ? '#c93030' : pct <= 50 ? '#c47b0a' : '#1baf7a';
      return `<tr>
        <td>${l.marca || '—'}</td>
        <td>${l.medida || '—'}</td>
        <td>${tipoBadge(l.tipo)}</td>
        <td style="text-align:center">
          <span style="color:${cor};font-weight:500">${l.quantidade_disp}</span>
          <span style="color:var(--text3)"> / ${l.quantidade_ini}</span>
        </td>
        <td style="text-align:right">${l.preco_unitario ? fmtEur(l.preco_unitario) : '—'}</td>
        <td style="text-align:right">${l.preco_unitario ? fmtEur(l.quantidade_disp * l.preco_unitario) : '—'}</td>
      </tr>`;
    }).join('');

    return `<div class="card" style="margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div>
          <span style="font-size:14px;font-weight:500">📄 ${f.num_fatura}</span>
          <span style="color:var(--text2);font-size:12px;margin-left:10px">${f.fornecedor}</span>
          ${f.data_fatura ? `<span style="color:var(--text3);font-size:11px;margin-left:8px">${f.data_fatura}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:12px;font-weight:500;color:var(--amber)">${fmtEur(totalFat)} em stock</span>
          <button class="btn btn-sm" onclick="apagarFatura(${f.id},'${f.num_fatura.replace(/'/g,"\\'")}'" 
            style="height:26px;padding:0 8px;font-size:11px;color:var(--red);border-color:#f5c6c6">
            🗑 Apagar
          </button>
        </div>
      </div>
      ${f.notas ? `<p style="font-size:11px;color:var(--text3);margin-bottom:10px;font-style:italic">${f.notas}</p>` : ''}
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Marca</th><th>Medida</th><th>Tipo</th>
            <th style="text-align:center">Disponível / Total</th>
            <th style="text-align:right">Preço unit. (€)</th>
            <th style="text-align:right">Valor disp. (€)</th>
          </tr></thead>
          <tbody>${linhasHTML}</tbody>
        </table>
      </div>
    </div>`;
  }).join('');
}

// ── NOVA FATURA ────────────────────────────────────────────────────
function abrirNovaFatura() {
  linhasFatura = [];
  document.getElementById('f-num').value   = '';
  document.getElementById('f-forn').value  = '';
  document.getElementById('f-data').value  = '';
  document.getElementById('f-notas').value = '';
  document.getElementById('f-feedback').classList.add('hidden');
  renderLinhasFatura();
  document.getElementById('painel-fatura').classList.add('open');
}


async function apagarFatura(id, numFatura) {
  if (!confirm(`Tens a certeza que queres apagar a fatura ${numFatura} e todos os pneus associados?`)) return;
  loading(true);
  // CASCADE no Supabase apaga automaticamente as linhas associadas
  const { error } = await sb.from('stock_faturas').delete().eq('id', id);
  loading(false);
  if (error) { alert('Erro ao apagar: ' + error.message); return; }
  loadStock();
}

function fecharPainelFatura() {
  document.getElementById('painel-fatura').classList.remove('open');
}

function adicionarLinhaFatura() {
  linhasFatura.push({ marca: '', medida: '', tipo: 'Novo', quantidade: '', preco: '' });
  renderLinhasFatura();
}

function removerLinhaFatura(idx) {
  linhasFatura.splice(idx, 1);
  renderLinhasFatura();
}

function renderLinhasFatura() {
  const container = document.getElementById('f-linhas');
  if (linhasFatura.length === 0) {
    container.innerHTML = `<p style="font-size:12px;color:var(--text3);text-align:center;padding:8px">
      Clica "+ Linha" para adicionar pneus desta fatura.</p>`;
    return;
  }
  container.innerHTML = linhasFatura.map((l, i) => `
    <div style="border:0.5px solid var(--border);border-radius:var(--radius);padding:10px;margin-bottom:8px;background:var(--surface1)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:11px;font-weight:500;color:var(--text2)">Linha ${i+1}</span>
        <button class="btn-close" onclick="removerLinhaFatura(${i})" style="font-size:12px">✕</button>
      </div>
      <div class="g3" style="gap:8px;margin-bottom:8px">
        <div class="frow" style="margin:0"><label>Marca</label>
          <input type="text" value="${l.marca}" oninput="linhasFatura[${i}].marca=this.value.toUpperCase();this.value=this.value.toUpperCase()" placeholder="MICHELIN"></div>
        <div class="frow" style="margin:0"><label>Medida</label>
          <input type="text" value="${l.medida}" oninput="linhasFatura[${i}].medida=this.value" placeholder="315/80"></div>
        <div class="frow" style="margin:0"><label>Tipo</label>
          <select onchange="linhasFatura[${i}].tipo=this.value">
            <option ${l.tipo==='Novo'?'selected':''}>Novo</option>
            <option ${l.tipo==='Remix'?'selected':''}>Remix</option>
            <option ${l.tipo==='Piso Aberto'?'selected':''}>Piso Aberto</option>
          </select></div>
      </div>
      <div class="g2" style="gap:8px">
        <div class="frow" style="margin:0"><label>Quantidade *</label>
          <input type="number" value="${l.quantidade}" oninput="linhasFatura[${i}].quantidade=this.value" placeholder="ex: 4" min="1"></div>
        <div class="frow" style="margin:0"><label>Preço unitário (€)</label>
          <input type="number" value="${l.preco}" oninput="linhasFatura[${i}].preco=this.value" placeholder="ex: 320" min="0" step="0.01"></div>
      </div>
    </div>`).join('');
}

async function guardarFatura() {
  const numFat = document.getElementById('f-num').value.trim().toUpperCase();
  const forn   = document.getElementById('f-forn').value.trim().toUpperCase();
  const data   = document.getElementById('f-data').value.trim() || null;
  const notas  = document.getElementById('f-notas').value.trim() || null;

  if (!numFat) { showFeedback('f-feedback', 'Nº de fatura é obrigatório.', true); return; }
  if (!forn)   { showFeedback('f-feedback', 'Fornecedor é obrigatório.', true); return; }
  if (linhasFatura.length === 0) { showFeedback('f-feedback', 'Adiciona pelo menos um pneu.', true); return; }

  // Validar linhas
  for (let i = 0; i < linhasFatura.length; i++) {
    const l = linhasFatura[i];
    const qty = parseInt(l.quantidade);
    if (!qty || qty <= 0) {
      showFeedback('f-feedback', `Linha ${i+1}: quantidade inválida.`, true); return;
    }
  }

  loading(true);

  // Criar fatura
  const { data: faturaData, error: errF } = await sb
    .from('stock_faturas')
    .insert([{ num_fatura: numFat, fornecedor: forn, data_fatura: data, notas }])
    .select()
    .single();

  if (errF) {
    loading(false);
    showFeedback('f-feedback', 'Erro ao criar fatura: ' + errF.message, true);
    return;
  }

  // Criar linhas
  const linhasInsert = linhasFatura.map(l => ({
    fatura_id:      faturaData.id,
    marca:          l.marca   || null,
    medida:         l.medida  || null,
    tipo:           l.tipo    || 'Novo',
    quantidade_ini: parseInt(l.quantidade),
    quantidade_disp:parseInt(l.quantidade),
    preco_unitario: l.preco ? parseFloat(l.preco) : null,
  }));

  const { error: errL } = await sb.from('stock_linhas').insert(linhasInsert);
  loading(false);

  if (errL) {
    showFeedback('f-feedback', 'Erro ao guardar linhas: ' + errL.message, true);
    return;
  }

  showFeedback('f-feedback', 'Fatura guardada com sucesso.');
  linhasFatura = [];
  setTimeout(() => { fecharPainelFatura(); loadStock(); }, 800);
}

// ── SELECCIONAR DE STOCK (usado no registo de montagem) ────────────
async function abrirSelStock() {
  loading(true);
  const { data: faturas, error } = await sb
    .from('stock_faturas')
    .select('*, stock_linhas(*)')
    .order('created_at', { ascending: false });
  loading(false);

  if (error || !faturas) return;

  // Só linhas com stock disponível
  const linhasDisp = [];
  faturas.forEach(f => {
    (f.stock_linhas || []).filter(l => l.quantidade_disp > 0).forEach(l => {
      linhasDisp.push({ ...l, num_fatura: f.num_fatura, fornecedor: f.fornecedor });
    });
  });

  const lista = document.getElementById('stock-sel-lista');
  if (linhasDisp.length === 0) {
    lista.innerHTML = '<p class="empty-msg">Sem stock disponível. Regista uma fatura primeiro.</p>';
  } else {
    lista.innerHTML = linhasDisp.map(l => `
      <div style="border:0.5px solid var(--border);border-radius:var(--radius);padding:10px;margin-bottom:8px;cursor:pointer;transition:background .1s"
           onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''"
           onclick="selecionarDeStock(${l.id},'${(l.marca||'').replace(/'/g,"\\'")}','${(l.medida||'').replace(/'/g,"\\'")}','${l.tipo||''}','${(l.fornecedor||'').replace(/'/g,"\\'")}',${l.preco_unitario||0})">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <span style="font-weight:500;font-size:13px">${l.marca || '—'} ${l.medida || ''}</span>
            <span style="margin-left:8px">${tipoBadge(l.tipo)}</span>
          </div>
          <span style="color:var(--amber);font-weight:500;font-size:13px">${l.preco_unitario ? fmtEur(l.preco_unitario) : '—'}</span>
        </div>
        <div style="font-size:11px;color:var(--text2);margin-top:4px">
          📄 ${l.num_fatura} · ${l.fornecedor} · 
          <span style="color:var(--aqua);font-weight:500">${l.quantidade_disp} disponíveis</span>
        </div>
      </div>`).join('');
  }

  document.getElementById('painel-stock-sel').classList.add('open');
}

function fecharSelStock() {
  document.getElementById('painel-stock-sel').classList.remove('open');
}

function selecionarDeStock(linhaId, marca, medida, tipo, fornecedor, preco) {
  // Preencher campos do formulário de registo
  document.getElementById('r-marca').value  = marca;
  document.getElementById('r-medida').value = medida;
  document.getElementById('r-tipo').value   = tipo;
  document.getElementById('r-forn').value   = fornecedor;
  document.getElementById('r-custo').value  = preco > 0 ? preco : '';

  // Guardar id da linha para descontar stock ao guardar
  stockLinhaSelId = linhaId;

  // Mostrar info do stock seleccionado
  const info = document.getElementById('r-stock-info');
  info.textContent = `✓ Pneu seleccionado de stock: ${marca} ${medida} ${tipo} — ${preco > 0 ? fmtEur(preco) : 'sem preço'} — Fornecedor: ${fornecedor}`;
  info.classList.remove('hidden');

  fecharSelStock();
}

// ── DESCONTO DE STOCK (chamado ao guardar montagem) ────────────────
async function descontarStock(linhaId) {
  if (!linhaId) return;

  // Buscar quantidade actual
  const { data: linha, error: errL } = await sb
    .from('stock_linhas')
    .select('quantidade_disp')
    .eq('id', linhaId)
    .single();

  if (errL || !linha) return;

  const novaQty = Math.max(0, linha.quantidade_disp - 1);
  await sb.from('stock_linhas').update({ quantidade_disp: novaQty }).eq('id', linhaId);
}
