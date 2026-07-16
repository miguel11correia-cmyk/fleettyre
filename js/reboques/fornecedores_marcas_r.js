// ── REBOQUES/FORNECEDORES_MARCAS.JS ──────────────────────────────

async function loadFornecedoresReboques() {
  loading(true);
  const { data, error } = await sb.from('reboques').select('*');
  loading(false);
  if (error || !data) return;

  const agg = {};
  data.forEach(r => {
    const k = r.fornecedor || '(sem registo)';
    if (!agg[k]) agg[k] = { total: 0, novo: 0, remix: 0, rechapado: 0, piso: 0, comCusto: 0, custo: 0 };
    agg[k].total++;
    if (r.tipo === 'Novo')        agg[k].novo++;
    else if (r.tipo === 'Remix')  agg[k].remix++;
    else if (r.tipo === 'Rechapado') agg[k].rechapado++;
    else if (r.tipo === 'Piso Aberto') agg[k].piso++;
    if (r.custo_pneu > 0) { agg[k].comCusto++; agg[k].custo += Number(r.custo_pneu); }
  });

  const keys = Object.keys(agg).sort((a, b) => agg[b].total - agg[a].total);
  const tbody = document.getElementById('rforn-tbody');
  if (tbody) {
    tbody.innerHTML = keys.map(k => {
      const f   = agg[k];
      const med = f.comCusto > 0 ? fmtEur(f.custo / f.comCusto) : '—';
      return `<tr>
        <td><strong>${k}</strong></td>
        <td>${f.total}</td><td>${f.novo}</td><td>${f.remix}</td><td>${f.rechapado}</td><td>${f.piso}</td>
        <td>${f.comCusto}</td>
        <td style="text-align:right">${f.custo > 0 ? fmtEur(f.custo) : '—'}</td>
        <td style="text-align:right">${med}</td>
      </tr>`;
    }).join('');
  }

  const keysComCusto = keys.filter(k => agg[k].comCusto > 0);
  if (keysComCusto.length > 0) {
    mkChart('rc-forn-custo', 'bar',
      keysComCusto,
      keysComCusto.map(k => Math.round(agg[k].custo / agg[k].comCusto)),
      COLORS.slice(0, keysComCusto.length)
    );
  }
}

async function loadMarcasReboques() {
  loading(true);
  const { data, error } = await sb.from('reboques').select('*');
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

  const keys = Object.keys(agg).sort((a, b) => agg[b].total - agg[a].total);
  const tbody = document.getElementById('rmarc-tbody');
  if (tbody) {
    tbody.innerHTML = keys.map(k => {
      const m = agg[k];
      const mesesM = m.mesesArr.length > 0
        ? Math.round(m.mesesArr.reduce((s,v) => s+v, 0) / m.mesesArr.length) + ' meses'
        : '—';
      const custoM = m.custos.length > 0
        ? fmtEur(m.custos.reduce((s,v) => s+v, 0) / m.custos.length)
        : '—';
      return `<tr>
        <td><strong>${k}</strong></td>
        <td>${m.total}</td><td>${m.novo}</td><td>${m.remix}</td><td>${m.rechapado}</td><td>${m.piso}</td>
        <td style="text-align:right">${mesesM}</td>
        <td style="text-align:right">${custoM}</td>
      </tr>`;
    }).join('');
  }

  const keysComMeses = keys.filter(k => agg[k].mesesArr.length > 0);
  if (keysComMeses.length > 0) {
    mkChart('rc-marc-dur', 'bar',
      keysComMeses,
      keysComMeses.map(k => Math.round(agg[k].mesesArr.reduce((s,v)=>s+v,0)/agg[k].mesesArr.length)),
      COLORS.slice(0, keysComMeses.length)
    );
  }
}
