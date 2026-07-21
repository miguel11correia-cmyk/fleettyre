// ── ANALYTICS ────────────────────────────────────────────────────
// ROI por tipo de pneu + comparação de eficiência entre veículos.
// Usa sempre o histórico completo (sem filtro de datas).

const TIPOS_ORDEM = ['Novo', 'Remix', 'Rechapado', 'Piso Aberto'];

// Selecciona uma amostra legível para o gráfico: top 5 mais eficientes,
// top 5 menos eficientes, e até 3 mais próximos da média — sem duplicar
// veículos que já entrem em mais do que um grupo (frotas pequenas).
function amostraComparativa(linhasOrdenadas, valorKey, media) {
  const n = linhasOrdenadas.length;
  const topN    = linhasOrdenadas.slice(0, 5);
  const bottomN = linhasOrdenadas.slice(Math.max(0, n - 5));

  const escolhidos = new Set([...topN, ...bottomN].map(l => l.matricula));
  const proximosMedia = linhasOrdenadas
    .filter(l => !escolhidos.has(l.matricula))
    .sort((a, b) => Math.abs(a[valorKey] - media) - Math.abs(b[valorKey] - media))
    .slice(0, 3);

  const vistos = new Set();
  const amostra = [...topN, ...bottomN, ...proximosMedia].filter(l => {
    if (vistos.has(l.matricula)) return false;
    vistos.add(l.matricula);
    return true;
  });

  amostra.sort((a, b) => a[valorKey] - b[valorKey]);
  return amostra;
}

async function loadAnalytics() {
  loading(true);
  const { data, error } = await sb.from('pneus').select('*');
  loading(false);
  if (error || !data) return;

  renderRoiPorTipo(data);
  renderComparacaoVeiculos(data);
}

// ── ANÁLISE 1 — ROI POR TIPO DE PNEU ──────────────────────────────

function renderRoiPorTipo(data) {
  const agg = {};
  data.forEach(r => {
    if (!r.kms_desmont || !r.kms_mont || !(r.custo_pneu > 0)) return;
    const kmsEf = r.kms_desmont - r.kms_mont;
    if (kmsEf <= 0) return;
    const tipo = r.tipo || 'Novo';
    if (!agg[tipo]) agg[tipo] = { kmsArr: [], custoArr: [], kmsPorEuroArr: [] };
    agg[tipo].kmsArr.push(kmsEf);
    agg[tipo].custoArr.push(Number(r.custo_pneu));
    agg[tipo].kmsPorEuroArr.push(kmsEf / Number(r.custo_pneu));
  });

  const keys = TIPOS_ORDEM.filter(t => agg[t]);
  const tbody = document.getElementById('roi-tipo-tbody');
  if (tbody) {
    if (keys.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-msg" style="text-align:center;padding:12px">Sem registos com KMs de montagem/desmontagem e custo preenchidos.</td></tr>';
    } else {
      tbody.innerHTML = keys.map(t => {
        const a        = agg[t];
        const kmsM     = Math.round(a.kmsArr.reduce((s, v) => s + v, 0) / a.kmsArr.length);
        const custoM   = a.custoArr.reduce((s, v) => s + v, 0) / a.custoArr.length;
        const kmsPorEu = a.kmsPorEuroArr.reduce((s, v) => s + v, 0) / a.kmsPorEuroArr.length;
        return `<tr>
          <td>${tipoBadge(t)}</td>
          <td style="text-align:right">${fmt(kmsM)}</td>
          <td style="text-align:right">${fmtEur(custoM)}</td>
          <td style="text-align:right">${fmt(Math.round(kmsPorEu))}</td>
          <td style="text-align:center">${a.kmsArr.length}</td>
        </tr>`;
      }).join('');
    }
  }

  if (keys.length > 0) {
    const vals = keys.map(t => Math.round(agg[t].kmsPorEuroArr.reduce((s, v) => s + v, 0) / agg[t].kmsPorEuroArr.length));
    mkChart('c-roi-tipo', 'bar', keys, vals, CHART_NEUTRAL);
  }
}

// ── ANÁLISE 2 — COMPARAÇÃO ENTRE VEÍCULOS ─────────────────────────

function renderComparacaoVeiculos(data) {
  const porMat = {};
  data.forEach(r => {
    if (!porMat[r.matricula]) porMat[r.matricula] = [];
    porMat[r.matricula].push(r);
  });

  const linhas = [];
  Object.keys(porMat).forEach(mat => {
    const regs      = porMat[mat];
    const comKms    = regs.filter(r => r.kms_desmont && r.kms_mont && r.kms_desmont > r.kms_mont);
    const kmsEfArr  = comKms.map(r => r.kms_desmont - r.kms_mont);
    const kmsMed    = kmsEfArr.length > 0 ? kmsEfArr.reduce((s, v) => s + v, 0) / kmsEfArr.length : null;

    const comCusto   = regs.filter(r => r.custo_pneu != null && r.custo_pneu > 0);
    const custoTotal = comCusto.reduce((s, r) => s + Number(r.custo_pneu), 0);
    const custoMed   = comCusto.length > 0 ? custoTotal / comCusto.length : null;

    const eurKm = (custoMed && kmsMed && kmsMed > 0) ? custoMed / kmsMed : null;
    if (eurKm == null) return; // só entram veículos com dados suficientes para comparar

    linhas.push({ matricula: mat, nPneus: regs.length, kmsMed, custoMed, eurKm });
  });

  const kpis = { media: 'an-media-frota', maisEf: 'an-mais-eficiente', menosEf: 'an-menos-eficiente', n: 'an-n-veiculos' };
  const tbody = document.getElementById('an-veiculos-tbody');

  if (linhas.length === 0) {
    Object.values(kpis).forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty-msg" style="text-align:center;padding:12px">Sem veículos com KMs e custo suficientes para comparar.</td></tr>';
    if (charts['c-an-veiculos']) { charts['c-an-veiculos'].destroy(); delete charts['c-an-veiculos']; }
    const chartMediaEmpty = document.getElementById('an-chart-media');
    if (chartMediaEmpty) chartMediaEmpty.textContent = '';
    return;
  }

  linhas.sort((a, b) => a.eurKm - b.eurKm); // mais eficiente (menor custo/km) primeiro
  const media = linhas.reduce((s, l) => s + l.eurKm, 0) / linhas.length;

  document.getElementById(kpis.media).textContent   = '€ ' + media.toFixed(4);
  document.getElementById(kpis.maisEf).textContent  = linhas[0].matricula;
  document.getElementById(kpis.menosEf).textContent = linhas[linhas.length - 1].matricula;
  document.getElementById(kpis.n).textContent       = linhas.length;

  if (tbody) {
    tbody.innerHTML = linhas.map((l, i) => {
      const acima    = l.eurKm > media;
      const badgeCls = acima ? 'b-alert' : 'b-ok';
      const badgeTxt = acima ? 'Acima da média' : 'Abaixo da média';
      return `<tr>
        <td>${i + 1}</td>
        <td><strong>${l.matricula}</strong></td>
        <td style="text-align:center">${l.nPneus}</td>
        <td style="text-align:right">${fmt(Math.round(l.kmsMed))}</td>
        <td style="text-align:right">${fmtEur(l.custoMed)}</td>
        <td style="text-align:right">€ ${l.eurKm.toFixed(4)}</td>
        <td><span class="badge ${badgeCls}">${badgeTxt}</span></td>
      </tr>`;
    }).join('');
  }

  const amostra   = amostraComparativa(linhas, 'eurKm', media);
  const barColors = amostra.map(l => l.eurKm > media ? '#c93030' : '#15803d');
  mkChart('c-an-veiculos', 'bar', amostra.map(l => l.matricula), amostra.map(l => Number(l.eurKm.toFixed(4))), barColors, {
    indexAxis: 'y',
    scales: {
      x: { grid: { color: '#e5e4df' }, ticks: { color: '#8a8884', font: { size: 10 } } },
      y: { grid: { display: false },   ticks: { color: '#8a8884', font: { size: 10 } } },
    },
  });

  const chartMedia = document.getElementById('an-chart-media');
  if (chartMedia) {
    chartMedia.textContent = `Média da frota: € ${media.toFixed(4)}/km — de referência para as barras acima (${amostra.length} de ${linhas.length} veículos: mais eficientes, menos eficientes e mais próximos da média)`;
  }
}
