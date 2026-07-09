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
  showFeedback('r-feedback', 'Montagem guardada com sucesso.');
  limparForm();
}

function limparForm() {
  ['r-mat','r-mes','r-kms','r-pos','r-marca','r-medida','r-forn','r-matpneu','r-custo','r-mo']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('r-tipo').value = 'Novo';
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
    const acBtn = !r.mes_desmont
      ? `<button class="btn btn-s" onclick="abrirPainel(${r.id})">🔧 Desmontar</button>`
      : '<span style="color:var(--text3);font-size:11px">✓ Concluído</span>';
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

async function loadAlertas() {
  loading(true);
  const { data, error } = await sb.from('pneus').select('*');
  loading(false);
  if (error || !data) return;

  // Alertas: escultura registada <= 3mm (e válida, ou seja, <= 20mm)
  const alertas = data.filter(r =>
    r.escultura_final != null &&
    r.escultura_final >= 0 &&
    r.escultura_final <= 3
  );

  const list = document.getElementById('alertas-list');
  if (alertas.length === 0) {
    list.innerHTML = '<p class="empty-msg">Nenhum registo com escultura ≤ 3mm.</p>';
  } else {
    list.innerHTML = alertas.map(r => {
      const pct = Math.max(5, Math.round((r.escultura_final / 16) * 100));
      const cor = r.escultura_final <= 1 ? '#c93030' : r.escultura_final <= 2 ? '#c47b0a' : '#e34948';
      return `<div class="alerta-row">
        <div class="alerta-info">
          <span class="alerta-mat">${r.matricula} — ${r.posicao || '—'}</span>
          <span class="alerta-det">${r.marca || '—'} ${r.medida || ''} · ${r.tipo || '—'} · Desmont.: ${r.mes_desmont || '—'}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="prog"><div class="prog-fill" style="width:${pct}%;background:${cor}"></div></div>
          <span class="badge b-alert">${r.escultura_final}\u202fmm</span>
        </div>
      </div>`;
    }).join('');
  }

  // Tabela de taxa de desgaste — apenas registos com dados completos e válidos
  const comDesgaste = data.filter(r => taxaDesgaste(r) !== null);
  const tbody = document.getElementById('desgaste-tbody');
  if (comDesgaste.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-msg" style="text-align:center;padding:12px">Sem registos de escultura final válidos ainda.</td></tr>';
  } else {
    tbody.innerHTML = comDesgaste.map(r => {
      const taxa = taxaDesgaste(r).toFixed(3);
      const kmsEf = r.kms_desmont - r.kms_mont;
      return `<tr>
        <td>${r.matricula}</td>
        <td>${r.posicao || '—'}</td>
        <td>${r.marca   || '—'}</td>
        <td>${tipoBadge(r.tipo)}</td>
        <td style="text-align:right">${fmt(kmsEf)}</td>
        <td style="text-align:right">${r.escultura_final}\u202fmm</td>
        <td style="text-align:right">${taxa}\u202fmm/1000km</td>
      </tr>`;
    }).join('');
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
