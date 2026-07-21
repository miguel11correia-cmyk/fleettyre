// ── REBOQUES/DASHBOARD.JS ─────────────────────────────────────────

// Limites de duração por eixo (meses) — padrão europeu semirreboque 3 eixos
const LIMITES_EIXO = {
  1: { aviso: 12, critico: 14 },
  2: { aviso: 20, critico: 24 },
  3: { aviso: 12, critico: 14 },
  null: { aviso: 12, critico: 14 } // fallback se eixo não definido
};

async function loadDashboardReboques() {
  loading(true);
  const { data, error } = await sb
    .from('reboques')
    .select('*')
    .order('mes_mont', { ascending: true });
  loading(false);
  if (error || !data) return;

  const hoje = mesAtual();
  const activos = data.filter(r => !r.mes_desmont);
  const mats    = [...new Set(data.map(r => r.matricula))];

  // Alertas — pneus activos com meses >= limite de aviso
  const alertas = activos.filter(r => {
    const meses = mesesEntre(r.mes_mont, hoje);
    const lim   = LIMITES_EIXO[r.eixo] || LIMITES_EIXO[null];
    return meses >= lim.aviso;
  });

  // Custos
  const comCusto   = data.filter(r => r.custo_pneu > 0);
  const custoTotal = comCusto.reduce((s, r) => s + Number(r.custo_pneu), 0);
  const custoMed   = comCusto.length > 0 ? custoTotal / comCusto.length : null;

  document.getElementById('rk-activos').textContent = activos.length;
  document.getElementById('rk-total').textContent   = data.length;
  document.getElementById('rk-mats').textContent    = mats.length;
  document.getElementById('rk-alerts').textContent  = alertas.length;
  document.getElementById('rk-custo').textContent   = custoTotal > 0 ? fmtEur(custoTotal) : '—';
  document.getElementById('rk-med').textContent     = custoMed ? fmtEur(custoMed) : '—';

  // Badge alertas reboques
  const badge = document.getElementById('badge-alertas-r');
  if (badge) {
    badge.textContent = alertas.length;
    badge.classList.toggle('hidden', alertas.length === 0);
  }

  // ── Gráfico tipo (só pneus activos) ──
  const tipos   = countBy(activos, 'tipo');
  const tLabels = Object.keys(tipos);
  const tColors = tLabels.map(l => l === 'Novo' ? '#0ca30c' : l === 'Remix' ? '#2a78d6' : l === 'Rechapado' ? '#6d28d9' : '#eda100');
  document.getElementById('rleg-tipo').innerHTML = makeLegend(tLabels, tColors);
  mkChart('rc-tipo', 'doughnut', tLabels, tLabels.map(k => tipos[k]), tColors);

  // ── Gráfico fornecedor (só pneus activos) ──
  const forns = countBy(activos, 'fornecedor');
  const fKeys = Object.keys(forns).sort((a, b) => forns[b] - forns[a]).slice(0, 8);
  document.getElementById('rleg-forn').innerHTML = makeLegend(fKeys, COLORS);
  mkChart('rc-forn', 'doughnut', fKeys, fKeys.map(k => forns[k]), COLORS.slice(0, fKeys.length));

  // ── Gráfico evolução mensal (linha) ──
  renderGraficoMensalReboques(data);

  // ── Tabela anual ──
  renderTabelaAnualReboques(data);

  // ── Duração média por eixo ──
  renderDuracaoPorEixo(data);
}

function renderDuracaoPorEixo(data) {
  const agg = {};
  data.forEach(r => {
    if (!r.mes_desmont || !r.mes_mont) return;
    const meses = mesesEntre(r.mes_mont, r.mes_desmont);
    if (meses <= 0) return;
    const k = r.eixo ? `Eixo ${r.eixo}` : '(sem eixo)';
    if (!agg[k]) agg[k] = [];
    agg[k].push(meses);
  });

  const keys = ['Eixo 1', 'Eixo 2', 'Eixo 3', ...Object.keys(agg).filter(k => !['Eixo 1', 'Eixo 2', 'Eixo 3'].includes(k))]
    .filter(k => agg[k]);

  const tbody = document.getElementById('duracao-eixo-tbody');
  if (tbody) {
    if (keys.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty-msg" style="text-align:center;padding:12px">Sem desmontagens registadas ainda.</td></tr>';
    } else {
      tbody.innerHTML = keys.map(k => {
        const arr = agg[k];
        const med = Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
        return `<tr>
          <td>${k}</td>
          <td style="text-align:right">${med} meses</td>
          <td style="text-align:center">${arr.length}</td>
        </tr>`;
      }).join('');
    }
  }

  if (keys.length > 0) {
    const vals = keys.map(k => Math.round(agg[k].reduce((s, v) => s + v, 0) / agg[k].length));
    mkChart('rc-duracao-eixo', 'bar', keys, vals, COLORS.slice(0, keys.length));
  }
}

function renderGraficoMensalReboques(data) {
  // Agrupar custos por mês
  const porMes = {};
  data.forEach(r => {
    if (!r.mes_mont || !r.custo_pneu || r.custo_pneu <= 0) return;
    const mes = r.mes_mont;
    porMes[mes] = (porMes[mes] || 0) + Number(r.custo_pneu);
  });

  const meses = Object.keys(porMes).sort();
  if (meses.length === 0) return;

  mkChart('rc-mensal', 'line', meses, meses.map(m => porMes[m]),
    ['#2a78d6'], {
      elements: {
        line: { borderColor: '#2a78d6', borderWidth: 2, tension: 0.3, fill: true, backgroundColor: 'rgba(42,120,214,0.08)' },
        point: { backgroundColor: '#2a78d6', radius: 3 }
      }
    }
  );
}

function renderTabelaAnualReboques(data) {
  // Agrupar por ano
  const porAno = {};
  data.forEach(r => {
    if (!r.mes_mont) return;
    const ano = r.mes_mont.split('-')[0];
    if (!porAno[ano]) porAno[ano] = { pneus: 0, custo: 0, comCusto: 0 };
    porAno[ano].pneus++;
    if (r.custo_pneu > 0) {
      porAno[ano].custo += Number(r.custo_pneu);
      porAno[ano].comCusto++;
    }
  });

  const anos = Object.keys(porAno).sort((a, b) => b - a);
  const tbody = document.getElementById('r-tabela-anual-tbody');
  if (!tbody) return;

  if (anos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-msg" style="text-align:center;padding:12px">Sem dados anuais ainda.</td></tr>';
    return;
  }

  tbody.innerHTML = anos.map(ano => {
    const d = porAno[ano];
    const med = d.comCusto > 0 ? fmtEur(d.custo / d.comCusto) : '—';
    return `<tr>
      <td><strong>${ano}</strong></td>
      <td style="text-align:center">${d.pneus}</td>
      <td style="text-align:right">${d.custo > 0 ? fmtEur(d.custo) : '—'}</td>
      <td style="text-align:right">${med}</td>
    </tr>`;
  }).join('');
}
