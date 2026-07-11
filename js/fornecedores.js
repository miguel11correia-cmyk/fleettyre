// ── FORNECEDORES ──────────────────────────────────────────────

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

