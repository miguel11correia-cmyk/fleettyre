// ── ANALYTICS ────────────────────────────────────────────────────
// ROI por tipo de pneu + comparação de eficiência entre veículos.
// Usa sempre o histórico completo (sem filtro de datas).

const TIPOS_ORDEM = ['Novo', 'Remix', 'Rechapado', 'Piso Aberto'];

async function loadAnalytics() {
  loading(true);
  const [{ data, error }, { data: veiculosData }] = await Promise.all([
    fetchAllRows(() => sb.from('pneus').select('*').eq('empresa_id', currentEmpresaId).order('id')),
    sb.from('veiculos').select('matricula, km_atual').eq('empresa_id', currentEmpresaId),
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
    if (!agg[tipo]) agg[tipo] = { kmsArr: [], custoArr: [], custoPor1000kmArr: [] };
    agg[tipo].kmsArr.push(kmsEf);
    agg[tipo].custoArr.push(Number(r.custo_pneu));
    agg[tipo].custoPor1000kmArr.push(Number(r.custo_pneu) / (kmsEf / 1000));
  });

  const keys = TIPOS_ORDEM.filter(t => agg[t]);
  const tbody = document.getElementById('roi-tipo-tbody');
  if (tbody) {
    if (keys.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-msg" style="text-align:center;padding:12px">Sem registos com KMs de montagem/desmontagem e custo preenchidos.</td></tr>';
    } else {
      tbody.innerHTML = keys.map(t => {
        const a             = agg[t];
        const kmsM          = Math.round(a.kmsArr.reduce((s, v) => s + v, 0) / a.kmsArr.length);
        const custoM        = a.custoArr.reduce((s, v) => s + v, 0) / a.custoArr.length;
        const custoPor1000km = a.custoPor1000kmArr.reduce((s, v) => s + v, 0) / a.custoPor1000kmArr.length;
        return `<tr>
          <td>${tipoBadge(t)}</td>
          <td style="text-align:right">${fmt(kmsM)}</td>
          <td style="text-align:right">${fmtEur(custoM)}</td>
          <td style="text-align:right">${fmtEur(custoPor1000km)}</td>
          <td style="text-align:center">${a.kmsArr.length}</td>
        </tr>`;
      }).join('');
    }
  }
}

// ── ANÁLISE 2 — COMPARAÇÃO ENTRE VEÍCULOS ─────────────────────────
// Direção desgasta a um ritmo muito diferente de Tração — comparar
// veículos por um único €/km combinado escondia qual das duas estava
// de facto a pesar mais no custo, por isso os KPIs passam a ser
// calculados em separado (ver também o €/km de "Por veículo"), com os
// dois resultados juntos numa única tabela, lado a lado por veículo.

function renderComparacaoVeiculos(data, kmAtualPorMat) {
  const dir = calcularComparacaoCategoria(data, kmAtualPorMat, 'Direção');
  const tra = calcularComparacaoCategoria(data, kmAtualPorMat, 'Tração');

  preencherKpisComparacao(dir, 'an-dir-');
  preencherKpisComparacao(tra, 'an-tra-');
  renderTabelaComparacaoCombinada(dir, tra);
}

// Linhas (uma por matrícula) + média da frota para uma categoria — sem
// tocar no DOM, para ser usado tanto nos KPIs separados como na tabela
// combinada (ver renderComparacaoVeiculos).
function calcularComparacaoCategoria(dataTodos, kmAtualPorMat, categoria) {
  const data = dataTodos.filter(r => categoriaPosicao(r.posicao) === categoria);
  const porMat = {};
  data.forEach(r => {
    if (!porMat[r.matricula]) porMat[r.matricula] = [];
    porMat[r.matricula].push(r);
  });
  // Contexto completo do veículo (todas as categorias) para a estimativa
  // de KMs — kmsReaisOuEstimados usa o kms_mont mais alto conhecido do
  // camião como pista, não só os da categoria em análise.
  const porMatTodos = {};
  dataTodos.forEach(r => {
    if (!porMatTodos[r.matricula]) porMatTodos[r.matricula] = [];
    porMatTodos[r.matricula].push(r);
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
    const kmsAtivosArr = ativosArr.filter(r => r.mes_mont && r.kms_mont).map(r => kmsReaisOuEstimados(r, porMatTodos[mat], kmAtual));
    const kmsMed = kmsAtivosArr.length > 0 ? kmsAtivosArr.reduce((s, v) => s + v, 0) / kmsAtivosArr.length : null;

    const comCustoAtivos = regs.filter(r => !r.mes_desmont && r.custo_pneu != null && r.custo_pneu > 0);

    // Custo ativos (€) = total gasto nos pneus desta categoria montados
    // agora (para a coluna de detalhe). €/km usa a MÉDIA por pneu, não a
    // soma — Tração tem o dobro dos pneus de Direção, por isso somar
    // inflava sempre o €/km de quem tem mais pneus na categoria, mesmo
    // quando cada pneu individual é mais barato por km.
    const custoAtivos = comCustoAtivos.reduce((s, r) => s + Number(r.custo_pneu), 0);
    const custoMed = comCustoAtivos.length > 0 ? custoAtivos / comCustoAtivos.length : null;
    const eurKm = (custoMed && custoMed > 0 && kmsMed && kmsMed > 0) ? custoMed / kmsMed : null;
    if (eurKm == null) return; // só entram veículos com dados suficientes para comparar

    linhas.push({ matricula: mat, nPneus: regs.length, kmsMed, custoAtivos, eurKm });
  });

  linhas.sort((a, b) => a.eurKm - b.eurKm);
  const media = linhas.length > 0 ? linhas.reduce((s, l) => s + l.eurKm, 0) / linhas.length : null;
  return { categoria, linhas, media };
}

function preencherKpisComparacao(resultado, prefixo) {
  const linhas = resultado.linhas;
  const media  = resultado.media;
  const kpis = { media: prefixo + 'media-frota', maisEf: prefixo + 'mais-eficiente', menosEf: prefixo + 'menos-eficiente', n: prefixo + 'n-veiculos' };

  if (linhas.length === 0) {
    Object.values(kpis).forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
    return;
  }

  document.getElementById(kpis.media).textContent   = fmtEurKm(media);
  document.getElementById(kpis.maisEf).textContent  = linhas[0].matricula;
  document.getElementById(kpis.menosEf).textContent = linhas[linhas.length - 1].matricula;
  document.getElementById(kpis.n).textContent       = linhas.length;
}

// Uma só tabela, agrupada por matrícula, com Direção e Tração lado a
// lado (uma linha cada) — mais fácil de comparar as duas posições do
// mesmo veículo de relance do que em duas tabelas separadas.
function renderTabelaComparacaoCombinada(dir, tra) {
  const tbody = document.getElementById('an-veiculos-tbody');
  if (!tbody) return;

  const mats = [...new Set([...dir.linhas.map(l => l.matricula), ...tra.linhas.map(l => l.matricula)])].sort();
  if (mats.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-msg" style="text-align:center;padding:12px">Sem veículos com KMs e custo suficientes para comparar.</td></tr>';
    return;
  }

  const porMatDir = {};
  dir.linhas.forEach(l => { porMatDir[l.matricula] = l; });
  const porMatTra = {};
  tra.linhas.forEach(l => { porMatTra[l.matricula] = l; });

  function linhaHtml(mat, l, categoria, media) {
    if (!l) {
      return '<tr style="color:var(--text3)"><td><strong>' + mat + '</strong></td><td>' + categoria + '</td><td colspan="5" class="empty-msg">Sem dados suficientes</td></tr>';
    }
    const acima    = media != null && l.eurKm > media;
    const badgeCls = acima ? 'b-alert' : 'b-ok';
    const badgeTxt = acima ? 'Acima da média' : 'Abaixo da média';
    return '<tr>'
      + '<td><strong>' + mat + '</strong></td>'
      + '<td>' + categoria + '</td>'
      + '<td style="text-align:center">' + l.nPneus + '</td>'
      + '<td style="text-align:right">' + fmt(Math.round(l.kmsMed)) + '</td>'
      + '<td style="text-align:right">' + fmtEur(l.custoAtivos) + '</td>'
      + '<td style="text-align:right">' + fmtEurKm(l.eurKm) + '</td>'
      + '<td><span class="badge ' + badgeCls + '">' + badgeTxt + '</span></td>'
      + '</tr>';
  }

  tbody.innerHTML = mats.map(mat =>
    linhaHtml(mat, porMatDir[mat], 'Direção', dir.media) +
    linhaHtml(mat, porMatTra[mat], 'Tração', tra.media)
  ).join('');
}
