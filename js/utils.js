// ── FORMATAÇÃO ────────────────────────────────────────────────────

function fmt(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('pt-PT');
}

function fmtEur(n) {
  if (n == null || n === '') return '—';
  return '€\u202f' + Number(n).toLocaleString('pt-PT', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

function tipoBadge(t) {
  if (!t) return '';
  if (t === 'Novo')        return `<span class="badge b-novo">Novo</span>`;
  if (t === 'Remix')       return `<span class="badge b-remix">Remix</span>`;
  if (t === 'Piso Aberto') return `<span class="badge b-piso">Piso Aberto</span>`;
  return `<span class="badge">${t}</span>`;
}

function countBy(arr, key) {
  return arr.reduce((m, r) => {
    const k = r[key] || '(sem registo)';
    m[k] = (m[k] || 0) + 1;
    return m;
  }, {});
}

function makeLegend(labels, colors) {
  return labels
    .map((l, i) => `<span><span class="lsq" style="background:${colors[i % colors.length]}"></span>${l}</span>`)
    .join('');
}

// ── CÁLCULOS DE DESGASTE ──────────────────────────────────────────

function escIni(tipo) {
  if (tipo === 'Remix')       return 14;
  if (tipo === 'Piso Aberto') return 12;
  return 16;
}

function taxaDesgaste(r) {
  const kmsEf = (r.kms_desmont || 0) - (r.kms_mont || 0);
  if (kmsEf <= 0) return null;
  const efinal = r.escultura_final;
  if (efinal == null || efinal < 0 || efinal > 20) return null;
  const eini = escIni(r.tipo);
  const desgaste = eini - efinal;
  if (desgaste < 0) return null;
  return (desgaste / kmsEf) * 1000;
}

function mesesEntre(mesInicio, mesFim) {
  if (!mesInicio || !mesFim) return 0;
  const [aI, mI] = mesInicio.split('-').map(Number);
  const [aF, mF] = mesFim.split('-').map(Number);
  return (aF - aI) * 12 + (mF - mI);
}

function mesAtual() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ── UI HELPERS ────────────────────────────────────────────────────

function loading(show) {
  document.getElementById('loading').classList.toggle('hidden', !show);
}

function showFeedback(id, msg, isError = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'feedback ' + (isError ? 'error' : 'success');
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3500);
}

// ── GRÁFICOS ──────────────────────────────────────────────────────

function mkChart(id, type, labels, data, colors, extraOpts = {}) {
  if (charts[id]) { charts[id].destroy(); }
  const el = document.getElementById(id);
  if (!el) return;
  const gridC = '#e5e4df';
  const tickC = '#8a8884';
  const baseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
  };
  const scalesBar = {
    x: { grid: { color: gridC }, ticks: { color: tickC, font: { size: 10 }, maxRotation: 40, autoSkip: false } },
    y: { grid: { color: gridC }, ticks: { color: tickC, font: { size: 10 } } },
  };
  const scalesBarH = {
    x: { grid: { color: gridC }, ticks: { color: tickC, font: { size: 10 } } },
    y: { grid: { display: false }, ticks: { color: tickC, font: { size: 10 } } },
  };
  let opts = { ...baseOpts };
  if (type === 'bar')      opts.scales = extraOpts.indexAxis === 'y' ? scalesBarH : scalesBar;
  if (type === 'doughnut') opts.cutout = '62%';
  charts[id] = new Chart(el, {
    type,
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 0,
        borderRadius: type === 'bar' ? 4 : 0,
      }],
    },
    options: { ...opts, ...extraOpts },
  });
}
