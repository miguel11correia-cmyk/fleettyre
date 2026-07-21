// ── REBOQUES/ANALYTICS.JS ────────────────────────────────────────
// Igual a js/analytics.js mas usando meses de duração em vez de KMs
// (reboques não têm conta-quilómetros próprio). Usa sempre o
// histórico completo (sem filtro de datas).

async function loadAnalyticsReboques() {
  loading(true);
  const { data, error } = await sb.from('reboques').select('*');
  loading(false);
  if (error || !data) return;

  renderRoiPorTipoReboques(data);
  renderComparacaoReboques(data);
}

// ── ANÁLISE 1 — ROI POR TIPO DE PNEU (meses) ──────────────────────

function renderRoiPorTipoReboques(data) {
  const agg = {};
  data.forEach(r => {
    if (!r.mes_desmont || !r.mes_mont || !(r.custo_pneu > 0)) return;
    const meses = mesesEntre(r.mes_mont, r.mes_desmont);
    if (meses <= 0) return;
    const tipo = r.tipo || 'Novo';
    if (!agg[tipo]) agg[tipo] = { mesesArr: [], custoArr: [], mesesPorEuroArr: [] };
    agg[tipo].mesesArr.push(meses);
    agg[tipo].custoArr.push(Number(r.custo_pneu));
    agg[tipo].mesesPorEuroArr.push(meses / Number(r.custo_pneu));
  });

  const keys = TIPOS_ORDEM.filter(t => agg[t]);
  const tbody = document.getElementById('rroi-tipo-tbody');
  if (tbody) {
    if (keys.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-msg" style="text-align:center;padding:12px">Sem registos com meses de duração e custo preenchidos.</td></tr>';
    } else {
      tbody.innerHTML = keys.map(t => {
        const a          = agg[t];
        const mesesM     = Math.round(a.mesesArr.reduce((s, v) => s + v, 0) / a.mesesArr.length);
        const custoM     = a.custoArr.reduce((s, v) => s + v, 0) / a.custoArr.length;
        const mesesPorEu = a.mesesPorEuroArr.reduce((s, v) => s + v, 0) / a.mesesPorEuroArr.length;
        return `<tr>
          <td>${tipoBadge(t)}</td>
          <td style="text-align:right">${mesesM} meses</td>
          <td style="text-align:right">${fmtEur(custoM)}</td>
          <td style="text-align:right">${mesesPorEu.toFixed(2)}</td>
          <td style="text-align:center">${a.mesesArr.length}</td>
        </tr>`;
      }).join('');
    }
  }

  if (keys.length > 0) {
    const vals = keys.map(t => Number((agg[t].mesesPorEuroArr.reduce((s, v) => s + v, 0) / agg[t].mesesPorEuroArr.length).toFixed(2)));
    mkChart('rc-roi-tipo', 'bar', keys, vals, CHART_NEUTRAL);
  }
}

// ── ANÁLISE 2 — COMPARAÇÃO ENTRE REBOQUES ─────────────────────────

function renderComparacaoReboques(data) {
  const porMat = {};
  data.forEach(r => {
    if (!porMat[r.matricula]) porMat[r.matricula] = [];
    porMat[r.matricula].push(r);
  });

  const linhas = [];
  Object.keys(porMat).forEach(mat => {
    const regs       = porMat[mat];
    const comMeses   = regs.filter(r => r.mes_desmont && r.mes_mont);
    const mesesArr   = comMeses.map(r => mesesEntre(r.mes_mont, r.mes_desmont));
    const mesesMed   = mesesArr.length > 0 ? mesesArr.reduce((s, v) => s + v, 0) / mesesArr.length : null;

    const comCusto   = regs.filter(r => r.custo_pneu != null && r.custo_pneu > 0);
    const custoTotal = comCusto.reduce((s, r) => s + Number(r.custo_pneu), 0);
    const custoMed   = comCusto.length > 0 ? custoTotal / comCusto.length : null;

    const eurMes = (custoMed && mesesMed && mesesMed > 0) ? custoMed / mesesMed : null;
    if (eurMes == null) return;

    linhas.push({ matricula: mat, nPneus: regs.length, mesesMed, custoMed, eurMes });
  });

  const kpis = { media: 'ran-media-frota', maisEf: 'ran-mais-eficiente', menosEf: 'ran-menos-eficiente', n: 'ran-n-veiculos' };
  const tbody = document.getElementById('ran-veiculos-tbody');

  if (linhas.length === 0) {
    Object.values(kpis).forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty-msg" style="text-align:center;padding:12px">Sem reboques com meses e custo suficientes para comparar.</td></tr>';
    if (charts['rc-an-veiculos']) { charts['rc-an-veiculos'].destroy(); delete charts['rc-an-veiculos']; }
    const chartMediaEmpty = document.getElementById('ran-chart-media');
    if (chartMediaEmpty) chartMediaEmpty.textContent = '';
    return;
  }

  linhas.sort((a, b) => a.eurMes - b.eurMes);
  const media = linhas.reduce((s, l) => s + l.eurMes, 0) / linhas.length;

  document.getElementById(kpis.media).textContent   = fmtEur(media);
  document.getElementById(kpis.maisEf).textContent  = linhas[0].matricula;
  document.getElementById(kpis.menosEf).textContent = linhas[linhas.length - 1].matricula;
  document.getElementById(kpis.n).textContent       = linhas.length;

  if (tbody) {
    tbody.innerHTML = linhas.map((l, i) => {
      const acima    = l.eurMes > media;
      const badgeCls = acima ? 'b-alert' : 'b-ok';
      const badgeTxt = acima ? 'Acima da média' : 'Abaixo da média';
      return `<tr>
        <td>${i + 1}</td>
        <td><strong>${l.matricula}</strong></td>
        <td style="text-align:center">${l.nPneus}</td>
        <td style="text-align:right">${Math.round(l.mesesMed)} meses</td>
        <td style="text-align:right">${fmtEur(l.custoMed)}</td>
        <td style="text-align:right">${fmtEur(l.eurMes)}</td>
        <td><span class="badge ${badgeCls}">${badgeTxt}</span></td>
      </tr>`;
    }).join('');
  }

  const amostra   = amostraComparativa(linhas, 'eurMes', media);
  const barColors = amostra.map(l => l.eurMes > media ? '#c93030' : '#15803d');
  mkChart('rc-an-veiculos', 'bar', amostra.map(l => l.matricula), amostra.map(l => Number(l.eurMes.toFixed(2))), barColors, {
    indexAxis: 'y',
    scales: {
      x: { grid: { color: '#e5e4df' }, ticks: { color: '#8a8884', font: { size: 10 } } },
      y: { grid: { display: false },   ticks: { color: '#8a8884', font: { size: 10 } } },
    },
  });

  const chartMedia = document.getElementById('ran-chart-media');
  if (chartMedia) {
    chartMedia.textContent = `Média da frota: ${fmtEur(media)}/mês — de referência para as barras acima (${amostra.length} de ${linhas.length} reboques: mais eficientes, menos eficientes e mais próximos da média)`;
  }
}
