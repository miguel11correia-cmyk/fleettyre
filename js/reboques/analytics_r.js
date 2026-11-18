// ── REBOQUES/ANALYTICS.JS ────────────────────────────────────────
// Igual a js/analytics.js mas usando meses de duração em vez de KMs
// (reboques não têm conta-quilómetros próprio). Usa sempre o
// histórico completo (sem filtro de datas).

async function loadAnalyticsReboques() {
  loading(true);
  const { data, error } = await fetchAllRows(() => sb.from('reboques').select('*').eq('empresa_id', currentEmpresaId).order('id'));
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
}

// ── ANÁLISE 2 — COMPARAÇÃO ENTRE REBOQUES ─────────────────────────
// Mesma lógica da versão para camiões (js/analytics.js), mas por Eixo
// (1/2/3) em vez de Direção/Tração — cada eixo tem limites de duração
// muito diferentes (ver LIMITES_EIXO), por isso uma única €/mês
// combinada escondia qual deles pesava mais no custo.

function renderComparacaoReboques(data) {
  const eixo1 = calcularComparacaoCategoriaReboques(data, 1);
  const eixo2 = calcularComparacaoCategoriaReboques(data, 2);
  const eixo3 = calcularComparacaoCategoriaReboques(data, 3);

  preencherKpisComparacaoReboques(eixo1, 'ran-e1-');
  preencherKpisComparacaoReboques(eixo2, 'ran-e2-');
  preencherKpisComparacaoReboques(eixo3, 'ran-e3-');
  renderTabelaComparacaoReboquesCombinada([eixo1, eixo2, eixo3]);
}

// Linhas (uma por matrícula) + média da frota para um eixo — sem tocar
// no DOM, reutilizado nos KPIs separados e na tabela combinada.
function calcularComparacaoCategoriaReboques(dataTodos, eixo) {
  const data = dataTodos.filter(r => r.eixo === eixo);
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

    const comCustoAtivos = regs.filter(r => !r.mes_desmont && r.custo_pneu != null && r.custo_pneu > 0);

    // Custo ativos (€) = total gasto neste eixo agora montado (coluna de
    // detalhe). €/mês usa a MÉDIA por pneu, não a soma — configurações de
    // rodado duplo têm o dobro dos pneus por eixo, o que inflava sempre o
    // €/mês desses eixos se se somasse tudo.
    const custoAtivos = comCustoAtivos.reduce((s, r) => s + Number(r.custo_pneu), 0);
    const custoMed = comCustoAtivos.length > 0 ? custoAtivos / comCustoAtivos.length : null;
    const eurMes = (custoMed && custoMed > 0 && mesesMed && mesesMed > 0) ? custoMed / mesesMed : null;
    if (eurMes == null) return;

    linhas.push({ matricula: mat, nPneus: regs.length, mesesMed, custoAtivos, eurMes });
  });

  linhas.sort((a, b) => a.eurMes - b.eurMes);
  const media = linhas.length > 0 ? linhas.reduce((s, l) => s + l.eurMes, 0) / linhas.length : null;
  return { eixo, linhas, media };
}

function preencherKpisComparacaoReboques(resultado, prefixo) {
  const linhas = resultado.linhas;
  const media  = resultado.media;
  const kpis = { media: prefixo + 'media-frota', maisEf: prefixo + 'mais-eficiente', menosEf: prefixo + 'menos-eficiente', n: prefixo + 'n-veiculos' };

  if (linhas.length === 0) {
    Object.values(kpis).forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
    return;
  }

  document.getElementById(kpis.media).textContent   = fmtEur(media);
  document.getElementById(kpis.maisEf).textContent  = linhas[0].matricula;
  document.getElementById(kpis.menosEf).textContent = linhas[linhas.length - 1].matricula;
  document.getElementById(kpis.n).textContent       = linhas.length;
}

// Uma só tabela, agrupada por matrícula, com os três eixos lado a lado
// (uma linha cada) — em vez de três tabelas separadas.
function renderTabelaComparacaoReboquesCombinada(resultados) {
  const tbody = document.getElementById('ran-veiculos-tbody');
  if (!tbody) return;

  const mats = [...new Set(resultados.flatMap(r => r.linhas.map(l => l.matricula)))].sort();
  if (mats.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-msg" style="text-align:center;padding:12px">Sem reboques com meses e custo suficientes para comparar.</td></tr>';
    return;
  }

  const porMatPorEixo = resultados.map(r => {
    const porMat = {};
    r.linhas.forEach(l => { porMat[l.matricula] = l; });
    return { eixo: r.eixo, media: r.media, porMat };
  });

  function linhaHtml(mat, l, eixo, media) {
    if (!l) {
      return '<tr style="color:var(--text3)"><td><strong>' + mat + '</strong></td><td>Eixo ' + eixo + '</td><td colspan="5" class="empty-msg">Sem dados suficientes</td></tr>';
    }
    const acima    = media != null && l.eurMes > media;
    const badgeCls = acima ? 'b-alert' : 'b-ok';
    const badgeTxt = acima ? 'Acima da média' : 'Abaixo da média';
    return '<tr>'
      + '<td><strong>' + mat + '</strong></td>'
      + '<td>Eixo ' + eixo + '</td>'
      + '<td style="text-align:center">' + l.nPneus + '</td>'
      + '<td style="text-align:right">' + Math.round(l.mesesMed) + ' meses</td>'
      + '<td style="text-align:right">' + fmtEur(l.custoAtivos) + '</td>'
      + '<td style="text-align:right">' + fmtEur(l.eurMes) + '</td>'
      + '<td><span class="badge ' + badgeCls + '">' + badgeTxt + '</span></td>'
      + '</tr>';
  }

  tbody.innerHTML = mats.map(mat =>
    porMatPorEixo.map(({ eixo, media, porMat }) => linhaHtml(mat, porMat[mat], eixo, media)).join('')
  ).join('');
}
