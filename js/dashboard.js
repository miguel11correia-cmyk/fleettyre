// ── DASHBOARD ──────────────────────────────────────────────

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

