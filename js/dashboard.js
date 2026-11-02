// ── DASHBOARD ──────────────────────────────────────────────

async function loadDashboard() {
  loading(true);
  const [{ data, error }, { data: veiculosData }] = await Promise.all([
    fetchAllRows(() => sb.from('pneus').select('*').eq('empresa_id', currentEmpresaId).order('mes_mont', { ascending: true })),
    sb.from('veiculos').select('matricula, km_atual').eq('empresa_id', currentEmpresaId),
  ]);
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

  // Mesma estimativa de desgaste usada na página "Alertas" — não uma
  // contagem à parte, para o número nunca mudar consoante a página.
  const kmAtualPorMat = {};
  (veiculosData || []).forEach(v => { if (v.km_atual != null) kmAtualPorMat[v.matricula] = v.km_atual; });
  const estimativas = calcularEstimativasDesgaste(data, kmAtualPorMat);
  const criticos    = estimativas.filter(r => r.nivel === 'critico');
  const matsAlerta  = new Set(criticos.map(r => r.matricula)).size;

  // Custo total — só registos com custo_pneu preenchido
  const comCusto = data.filter(r => r.custo_pneu != null && r.custo_pneu > 0);
  const custoTotal = comCusto.reduce((s, r) => s + Number(r.custo_pneu), 0);
  const custoMed   = comCusto.length > 0 ? custoTotal / comCusto.length : null;

  document.getElementById('k-activos').textContent = activos;
  document.getElementById('k-total').textContent   = data.length;
  document.getElementById('k-mats').textContent    = mats;
  document.getElementById('k-alerts').textContent  = criticos.length;
  document.getElementById('k-custo').textContent   = custoTotal > 0 ? fmtEur(custoTotal) : '—';
  document.getElementById('k-med').textContent     = custoMed   ? fmtEur(custoMed)   : '—';

  // Badge alertas no menu — nº de veículos, não de pneus
  const badge = document.getElementById('badge-alertas');
  badge.textContent = matsAlerta;
  badge.classList.toggle('hidden', matsAlerta === 0);

  // ── Gráfico tipo (só pneus ativos) ──
  const tipos   = countBy(registosAtivos, 'tipo');
  const tLabels = Object.keys(tipos).sort((a, b) => tipos[b] - tipos[a]);
  mkChart('c-tipo', 'bar', tLabels, tLabels.map(k => tipos[k]), CHART_NEUTRAL, { topLabels: true });

  // ── Gráfico fornecedor (só pneus ativos — todos, não só os 8 maiores,
  // para a soma das barras bater sempre certo com "Pneus ativos") ──
  const forns   = countBy(registosAtivos, 'fornecedor');
  const fKeys   = Object.keys(forns).sort((a, b) => forns[b] - forns[a]);
  mkChart('c-forn', 'bar', fKeys, fKeys.map(k => forns[k]), CHART_NEUTRAL, { topLabels: true });

  // ── Gráfico marca (só pneus ativos — todos, incluindo sem marca
  // registada, pela mesma razão do fornecedor acima) ──
  const marcs   = countBy(registosAtivos, 'marca');
  const mKeys   = Object.keys(marcs).sort((a, b) => marcs[b] - marcs[a]);
  mkChart('c-marc', 'bar', mKeys, mKeys.map(k => marcs[k]), CHART_NEUTRAL, { topLabels: true });

  // ── Gráfico evolução mensal (linha) ──
  const porMes = {};
  data.forEach(r => {
    if (!r.mes_mont || !r.custo_pneu || r.custo_pneu <= 0) return;
    porMes[r.mes_mont] = (porMes[r.mes_mont] || 0) + Number(r.custo_pneu);
  });
  const meses = Object.keys(porMes).sort();
  if (meses.length > 0) {
    mkChart('c-mensal', 'line', meses, meses.map(m => porMes[m]), [CHART_NEUTRAL], {
  showLine: true,
  elements: {
    line: { borderColor: CHART_NEUTRAL, borderWidth: 2, tension: 0.3, fill: false },
    point: { backgroundColor: CHART_NEUTRAL, radius: 3 }
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
    const k = categoriaPosicao(r.posicao);
    if (!k) return;
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
    const vals = posKeys.map(k => Number((posAgg[k].taxaArr.reduce((s, v) => s + v, 0) / posAgg[k].taxaArr.length).toFixed(3)));
    mkChart('c-desgaste-pos', 'bar', posKeys, vals, CHART_NEUTRAL);
  }
}

