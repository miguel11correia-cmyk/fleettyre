// ── ANALYTICS ────────────────────────────────────────────────────
// ROI por tipo de pneu + comparação de eficiência entre veículos.
// Usa sempre o histórico completo (sem filtro de datas).

const TIPOS_ORDEM = ['Novo', 'Remix', 'Rechapado', 'Piso Aberto'];

async function loadAnalytics() {
  loading(true);
  const [{ data, error }, { data: veiculosData }] = await Promise.all([
    sb.from('pneus').select('*'),
    sb.from('veiculos').select('matricula, km_atual'),
  ]);
  loading(false);
  if (error || !data) return;

  const kmAtualPorMat = {};
  (veiculosData || []).forEach(v => { if (v.km_atual != null) kmAtualPorMat[v.matricula] = v.km_atual; });

  renderRoiPorTipo(data);
  renderComparacaoVeiculos(data, kmAtualPorMat);
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

function renderComparacaoVeiculos(data, kmAtualPorMat) {
  const porMat = {};
  data.forEach(r => {
    if (!porMat[r.matricula]) porMat[r.matricula] = [];
    porMat[r.matricula].push(r);
  });

  const linhas = [];
  Object.keys(porMat).forEach(mat => {
    const regs      = porMat[mat];
    const kmAtual   = kmAtualPorMat ? kmAtualPorMat[mat] : null;
    const ativosArr = regs.filter(r => !r.mes_desmont);

    // KMs médios dos pneus ACTIVOS — kmsReaisOuEstimados (js/alertas.js)
    // já tinha a cascata real→estimativa desde antes de haver telemetria,
    // por isso funciona sempre, mesmo sem Cartrack ligado. Exige
    // mes_mont/kms_mont preenchidos, tal como o uso original em Alertas.
    const kmsAtivosArr = ativosArr.filter(r => r.mes_mont && r.kms_mont).map(r => kmsReaisOuEstimados(r, regs, kmAtual));
    const kmsMed = kmsAtivosArr.length > 0 ? kmsAtivosArr.reduce((s, v) => s + v, 0) / kmsAtivosArr.length : null;

    const comCusto = regs.filter(r => r.custo_pneu != null && r.custo_pneu > 0);

    // €/km = custo dos pneus ACTIVOS (montados agora) ÷ KMs médios dos
    // pneus ACTIVOS — não o histórico todo, que faria o valor crescer
    // sempre à medida que mais pneus vão sendo substituídos.
    const custoAtivos = comCusto.filter(r => !r.mes_desmont).reduce((s, r) => s + Number(r.custo_pneu), 0);
    const eurKm = (custoAtivos > 0 && kmsMed && kmsMed > 0) ? custoAtivos / kmsMed : null;
    if (eurKm == null) return; // só entram veículos com dados suficientes para comparar

    linhas.push({ matricula: mat, nPneus: regs.length, kmsMed, custoAtivos, eurKm });
  });

  const kpis = { media: 'an-media-frota', maisEf: 'an-mais-eficiente', menosEf: 'an-menos-eficiente', n: 'an-n-veiculos' };
  const tbody = document.getElementById('an-veiculos-tbody');

  if (linhas.length === 0) {
    Object.values(kpis).forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty-msg" style="text-align:center;padding:12px">Sem veículos com KMs e custo suficientes para comparar.</td></tr>';
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
        <td style="text-align:right">${fmtEur(l.custoAtivos)}</td>
        <td style="text-align:right">€ ${l.eurKm.toFixed(4)}</td>
        <td><span class="badge ${badgeCls}">${badgeTxt}</span></td>
      </tr>`;
    }).join('');
  }
}
