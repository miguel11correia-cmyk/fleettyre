// ── MARCAS ──────────────────────────────────────────────

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

