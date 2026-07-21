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

  const registosAtivos = data.filter(r => !r.mes_desmont);
  const activos  = registosAtivos.length;
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

  // ── Gráfico tipo (só pneus activos) ──
  const tipos   = countBy(registosAtivos, 'tipo');
  const tLabels = Object.keys(tipos);
  const tColors = tLabels.map(l =>
    l === 'Novo' ? '#0ca30c' : l === 'Remix' ? '#2a78d6' : l === 'Rechapado' ? '#6d28d9' : '#eda100'
  );
  document.getElementById('leg-tipo').innerHTML = makeLegend(tLabels, tColors);
  mkChart('c-tipo', 'doughnut', tLabels, tLabels.map(k => tipos[k]), tColors);

  // ── Gráfico fornecedor (só pneus activos) ──
  const forns   = countBy(registosAtivos, 'fornecedor');
  const fKeys   = Object.keys(forns).sort((a, b) => forns[b] - forns[a]).slice(0, 8);
  document.getElementById('leg-forn').innerHTML = makeLegend(fKeys, COLORS);
  mkChart('c-forn', 'doughnut', fKeys, fKeys.map(k => forns[k]), COLORS.slice(0, fKeys.length));

  // ── Gráfico marca (só pneus activos) ──
  const marcs   = countBy(registosAtivos.filter(r => r.marca), 'marca');
  const mKeys   = Object.keys(marcs).sort((a, b) => marcs[b] - marcs[a]);
  document.getElementById('leg-marc').innerHTML = makeLegend(mKeys, COLORS);
  mkChart('c-marc', 'doughnut', mKeys, mKeys.map(k => marcs[k]), COLORS.slice(0, mKeys.length));

  // ── Gráfico evolução mensal (linha) ──
  const porMes = {};
  data.forEach(r => {
    if (!r.mes_mont || !r.custo_pneu || r.custo_pneu <= 0) return;
    porMes[r.mes_mont] = (porMes[r.mes_mont] || 0) + Number(r.custo_pneu);
  });
  const meses = Object.keys(porMes).sort();
  if (meses.length > 0) {
    mkChart('c-mensal', 'line', meses, meses.map(m => porMes[m]), ['#2a78d6'], {
  showLine: true,
  elements: {
    line: { borderColor: '#2a78d6', borderWidth: 2, tension: 0.3, fill: false },
    point: { backgroundColor: '#2a78d6', radius: 3 }
      }
    });
  }

  // ── Tabela anual ──
  const porAno = {};
  data.forEach(r => {
    if (!r.mes_mont) return;
    const ano = r.mes_mont.split('-')[0];
    if (!porAno[ano]) porAno[ano] = { pneus: 0, custo: 0, comCusto: 0 };
    porAno[ano].pneus++;
    if (r.custo_pneu > 0) { porAno[ano].custo += Number(r.custo_pneu); porAno[ano].comCusto++; }
  });
  const anos = Object.keys(porAno).sort((a, b) => b - a);
  const tbodyAnual = document.getElementById('tabela-anual-tbody');
  if (tbodyAnual) {
    tbodyAnual.innerHTML = anos.map(ano => {
      const d   = porAno[ano];
      const med = d.comCusto > 0 ? fmtEur(d.custo / d.comCusto) : '—';
      return `<tr>
        <td><strong>${ano}</strong></td>
        <td style="text-align:center">${d.pneus}</td>
        <td style="text-align:right">${d.custo > 0 ? fmtEur(d.custo) : '—'}</td>
        <td style="text-align:right">${med}</td>
      </tr>`;
    }).join('');
  }

  // ── Taxa de desgaste por posição (Direção vs Tração) ──
  const posAgg = {};
  data.forEach(r => {
    const taxa = taxaDesgaste(r);
    if (taxa === null) return;
    const k = r.posicao || '(sem posição)';
    if (!posAgg[k]) posAgg[k] = { taxaArr: [], kmsArr: [] };
    posAgg[k].taxaArr.push(taxa);
    posAgg[k].kmsArr.push(r.kms_desmont - r.kms_mont);
  });

  const posKeys = ['Direção', 'Tração', ...Object.keys(posAgg).filter(k => k !== 'Direção' && k !== 'Tração')]
    .filter(k => posAgg[k]);
  const tbodyPos = document.getElementById('desgaste-pos-tbody');
  if (tbodyPos) {
    if (posKeys.length === 0) {
      tbodyPos.innerHTML = '<tr><td colspan="4" class="empty-msg" style="text-align:center;padding:12px">Sem registos históricos com escultura final ainda.</td></tr>';
    } else {
      tbodyPos.innerHTML = posKeys.map(k => {
        const a       = posAgg[k];
        const taxaM   = a.taxaArr.reduce((s, v) => s + v, 0) / a.taxaArr.length;
        const kmsM    = a.kmsArr.reduce((s, v) => s + v, 0) / a.kmsArr.length;
        return `<tr>
          <td>${k}</td>
          <td style="text-align:right">${taxaM.toFixed(3)}</td>
          <td style="text-align:right">${fmt(Math.round(kmsM))}</td>
          <td style="text-align:center">${a.taxaArr.length}</td>
        </tr>`;
      }).join('');
    }
  }

  if (posKeys.length > 0) {
    const vals   = posKeys.map(k => Number((posAgg[k].taxaArr.reduce((s, v) => s + v, 0) / posAgg[k].taxaArr.length).toFixed(3)));
    const colors = posKeys.map((k, i) => k === 'Direção' ? '#2a78d6' : k === 'Tração' ? '#0ca30c' : COLORS[(i + 2) % COLORS.length]);
    mkChart('c-desgaste-pos', 'bar', posKeys, vals, colors);
  }
}

