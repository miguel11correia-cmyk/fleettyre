// ── REBOQUES/FORNECEDORES_MARCAS.JS ──────────────────────────────
// A analise de Fornecedores fundiu-se com a de veiculos — ver
// loadFornecedores() em js/fornecedores.js. Marcas continua separada
// (ver seccao sobre a app, ranking por eficiencia nao e combinavel).

async function loadMarcasReboques() {
  loading(true);
  const { data, error } = await fetchAllRows(() => sb.from('reboques').select('*').eq('empresa_id', currentEmpresaId).order('id'));
  loading(false);
  if (error || !data) return;
  const hoje = mesAtual();

  const agg = {};
  data.filter(r => r.marca).forEach(r => {
    const k = r.marca;
    if (!agg[k]) agg[k] = { total: 0, novo: 0, remix: 0, rechapado: 0, piso: 0, mesesArr: [], custos: [] };
    agg[k].total++;
    if (r.tipo === 'Novo')        agg[k].novo++;
    else if (r.tipo === 'Remix')  agg[k].remix++;
    else if (r.tipo === 'Rechapado') agg[k].rechapado++;
    else if (r.tipo === 'Piso Aberto') agg[k].piso++;
    if (r.mes_desmont && r.mes_mont) {
      agg[k].mesesArr.push(mesesEntre(r.mes_mont, r.mes_desmont));
    }
    if (r.custo_pneu > 0) agg[k].custos.push(Number(r.custo_pneu));
  });

  // €/mês desta marca = custo médio ÷ duração média, usando o
  // histórico completo da marca (várias pneus independentes, não uma
  // entidade única a acumular histórico) — mais amostras dão uma média
  // mais robusta, ao contrário de "Por reboque"/"Análise".
  const eurMesPorMarca = {};
  Object.keys(agg).forEach(k => {
    const m = agg[k];
    const custoM = m.custos.length   > 0 ? m.custos.reduce((s,v) => s+v, 0)   / m.custos.length   : null;
    const mesesM = m.mesesArr.length > 0 ? m.mesesArr.reduce((s,v) => s+v, 0) / m.mesesArr.length : null;
    eurMesPorMarca[k] = (custoM && mesesM && mesesM > 0) ? custoM / mesesM : null;
  });

  const keys = Object.keys(agg).sort((a, b) => {
    const ea = eurMesPorMarca[a], eb = eurMesPorMarca[b];
    if (ea != null && eb != null) return ea - eb;
    if (ea != null) return -1;
    if (eb != null) return 1;
    return agg[b].total - agg[a].total;
  });

  const tbody = document.getElementById('rmarc-tbody');
  if (tbody) {
    tbody.innerHTML = keys.map((k, i) => {
      const m = agg[k];
      const mesesM = m.mesesArr.length > 0
        ? Math.round(m.mesesArr.reduce((s,v) => s+v, 0) / m.mesesArr.length) + ' meses'
        : '—';
      const custoM = m.custos.length > 0
        ? fmtEur(m.custos.reduce((s,v) => s+v, 0) / m.custos.length)
        : '—';
      const eurMes = eurMesPorMarca[k];
      return `<tr>
        <td>${eurMes != null ? i + 1 : '—'}</td>
        <td><strong>${k}</strong></td>
        <td>${m.total}</td><td>${m.novo}</td><td>${m.remix}</td><td>${m.rechapado}</td><td>${m.piso}</td>
        <td style="text-align:right">${mesesM}</td>
        <td style="text-align:right">${custoM}</td>
        <td style="text-align:right">${eurMes != null ? fmtEur(eurMes) : '—'}</td>
      </tr>`;
    }).join('');
  }

  const keysComMeses = keys.filter(k => agg[k].mesesArr.length > 0);
  if (keysComMeses.length > 0) {
    mkChart('rc-marc-dur', 'bar',
      keysComMeses,
      keysComMeses.map(k => Math.round(agg[k].mesesArr.reduce((s,v)=>s+v,0)/agg[k].mesesArr.length)),
      CHART_NEUTRAL
    );
  }
}
