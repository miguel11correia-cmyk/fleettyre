// ── ALERTAS ──────────────────────────────────────────────

// Agrupa a taxa de desgaste (mm/1000km) de registos históricos por uma chave à escolha.
function calcularTaxasPor(dados, chaveFn) {
  const taxas = {};
  dados.forEach(r => {
    const t = taxaDesgaste(r);
    if (t === null) return;
    const chave = chaveFn(r);
    if (!taxas[chave]) taxas[chave] = [];
    taxas[chave].push(t);
  });
  const medias = {};
  Object.keys(taxas).forEach(k => {
    const arr = taxas[k];
    medias[k] = arr.reduce((s, v) => s + v, 0) / arr.length;
  });
  return medias;
}

// Cascata de fallback, da estimativa mais específica para a mais genérica:
// marca+tipo+posição → marca+tipo → marca → média global → constante fixa.
function taxaEstimada(r, taxasPorMTP, taxasPorMT, taxasPorM, todasTaxas) {
  const marca = r.marca    || 'DESCONHECIDA';
  const tipo  = r.tipo     || 'Novo';
  const posic = r.posicao  || 'DESCONHECIDA';

  const chaveMTP = `${marca}|${tipo}|${posic}`;
  if (taxasPorMTP[chaveMTP] != null) return taxasPorMTP[chaveMTP];

  const chaveMT = `${marca}|${tipo}`;
  if (taxasPorMT[chaveMT] != null) return taxasPorMT[chaveMT];

  if (taxasPorM[marca] != null) return taxasPorM[marca];

  if (todasTaxas.length > 0) {
    return todasTaxas.reduce((s, v) => s + v, 0) / todasTaxas.length;
  }
  return 0.08; // fallback sector pesados
}

function kmsReaisOuEstimados(pneu, todosDoCamiao) {
  // 1. Usar KMs máximos conhecidos do camião (registo mais recente com KMs)
  const kmsMax = todosDoCamiao
    .filter(r => r.kms_mont && r.kms_mont > 0)
    .reduce((max, r) => Math.max(max, r.kms_mont), 0);

  if (kmsMax > pneu.kms_mont) {
    // Sabemos que o camião já andou pelo menos esta diferença
    return kmsMax - pneu.kms_mont;
  }

  // 2. Fallback: estimar por média mensal entre montagens conhecidas
  const ordenados = todosDoCamiao
    .filter(r => r.kms_mont && r.mes_mont)
    .sort((a, b) => a.kms_mont - b.kms_mont);

  if (ordenados.length >= 2) {
    const taxas = [];
    for (let i = 1; i < ordenados.length; i++) {
      const kmsDif = ordenados[i].kms_mont - ordenados[i-1].kms_mont;
      const mesesDif = mesesEntre(ordenados[i-1].mes_mont, ordenados[i].mes_mont);
      if (kmsDif > 0 && mesesDif > 0 && kmsDif/mesesDif <= 25000) {
        taxas.push(kmsDif / mesesDif);
      }
    }
    if (taxas.length > 0) {
      const kmsMes = taxas.reduce((s, v) => s + v, 0) / taxas.length;
      const meses = mesesEntre(pneu.mes_mont, mesAtual());
      return Math.round(meses * kmsMes);
    }
  }

  // 3. Último fallback: 7500 km/mês (mais conservador)
  const meses = mesesEntre(pneu.mes_mont, mesAtual());
  return Math.round(meses * 7500);
}

async function loadAlertas() {
  loading(true);
  const { data, error } = await sb.from('pneus').select('*');
  loading(false);
  if (error || !data) return;

  const taxasPorMTP = calcularTaxasPor(data, r => `${r.marca || 'DESCONHECIDA'}|${r.tipo || 'Novo'}|${r.posicao || 'DESCONHECIDA'}`);
  const taxasPorMT  = calcularTaxasPor(data, r => `${r.marca || 'DESCONHECIDA'}|${r.tipo || 'Novo'}`);
  const taxasPorM   = calcularTaxasPor(data, r => r.marca || 'DESCONHECIDA');
  const todasTaxas  = data.map(r => taxaDesgaste(r)).filter(t => t !== null);

  // Agrupar por matrícula
  const porMat = {};
  data.forEach(r => {
    if (!porMat[r.matricula]) porMat[r.matricula] = [];
    porMat[r.matricula].push(r);
  });

  // Para cada pneu activo, calcular KMs reais ou estimados
  const estimativas = [];
  const activos = data.filter(r => !r.mes_desmont && r.mes_mont && r.kms_mont);

  activos.forEach(r => {
    const kmsFeitos = kmsReaisOuEstimados(r, porMat[r.matricula] || [r]);
    const taxa      = taxaEstimada(r, taxasPorMTP, taxasPorMT, taxasPorM, todasTaxas);
    const escInicial = escIni(r.tipo);
    const escEstimada = Math.max(0, Math.round((escInicial - (kmsFeitos / 1000 * taxa)) * 10) / 10);

    estimativas.push({
      ...r,
      kmsFeitos,
      taxa,
      escEstimada,
    });
  });

  estimativas.sort((a, b) => a.escEstimada - b.escEstimada);

  const criticos = estimativas.filter(r => r.escEstimada <= 3);
  const aviso    = estimativas.filter(r => r.escEstimada > 3 && r.escEstimada <= 5);

  // Badge
  const badge = document.getElementById('badge-alertas');
  badge.textContent = criticos.length;
  badge.classList.toggle('hidden', criticos.length === 0);
  document.getElementById('k-alerts').textContent = criticos.length;

  // Críticos
  const list = document.getElementById('alertas-list');
  if (criticos.length === 0) {
    list.innerHTML = '<p class="empty-msg">Nenhum pneu activo com escultura estimada ≤ 3mm.</p>';
  } else {
    list.innerHTML = criticos.map(r => {
      const pct = Math.max(3, Math.round((r.escEstimada / escIni(r.tipo)) * 100));
      const cor = r.escEstimada <= 1 ? '#c93030' : r.escEstimada <= 2 ? '#c47b0a' : '#e34948';
      return `<div class="alerta-row">
        <div class="alerta-info">
          <span class="alerta-mat">${r.matricula} — ${r.posicao || '—'}</span>
          <span class="alerta-det">${r.marca || '—'} ${r.medida || ''} · ${r.tipo || '—'} · Mont.: ${r.mes_mont} · ${fmt(r.kmsFeitos)} km efectuados</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="prog"><div class="prog-fill" style="width:${pct}%;background:${cor}"></div></div>
          <span class="badge b-alert">~${r.escEstimada} mm</span>
        </div>
      </div>`;
    }).join('');
  }

  // Tabela completa
  const tbody = document.getElementById('desgaste-tbody');
  if (tbody) {
    tbody.innerHTML = estimativas.map(r => {
      const escCls = r.escEstimada <= 3 ? 'badge b-alert' :
                     r.escEstimada <= 5 ? 'badge b-warn'  : '';
      return `<tr>
        <td>${r.matricula}</td>
        <td>${r.posicao || '—'}</td>
        <td>${r.marca   || '—'}</td>
        <td>${tipoBadge(r.tipo)}</td>
        <td style="text-align:right">${r.mes_mont}</td>
        <td style="text-align:right">${fmt(r.kmsFeitos)}</td>
        <td style="text-align:right">${r.taxa.toFixed(3)} mm/1000km</td>
        <td><span class="${escCls}">${r.escEstimada} mm</span></td>
      </tr>`;
    }).join('');
  }

  // Avisos
  const avisoDiv = document.getElementById('alertas-aviso');
  if (avisoDiv) {
    if (aviso.length === 0) {
      avisoDiv.innerHTML = '<p class="empty-msg">Nenhum pneu activo com escultura estimada entre 3 e 5mm.</p>';
    } else {
      avisoDiv.innerHTML = aviso.map(r => `<div class="alerta-row">
        <div class="alerta-info">
          <span class="alerta-mat">${r.matricula} — ${r.posicao || '—'}</span>
          <span class="alerta-det">${r.marca || '—'} ${r.medida || ''} · ${r.tipo || '—'} · Mont.: ${r.mes_mont}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="prog"><div class="prog-fill" style="width:${Math.round(r.escEstimada/escIni(r.tipo)*100)}%;background:#c47b0a"></div></div>
          <span class="badge b-warn">~${r.escEstimada} mm</span>
        </div>
      </div>`).join('');
    }
  }

  // Histórico de taxas
  const tbody2 = document.getElementById('escultura-tbody');
  const comDesgaste = data.filter(r => taxaDesgaste(r) !== null);
  if (tbody2) {
    if (comDesgaste.length === 0) {
      tbody2.innerHTML = '<tr><td colspan="7" class="empty-msg" style="text-align:center;padding:12px">Sem registos históricos com escultura final ainda.</td></tr>';
    } else {
      tbody2.innerHTML = comDesgaste.map(r => {
        const taxa = taxaDesgaste(r).toFixed(3);
        const kmsEf = r.kms_desmont - r.kms_mont;
        return `<tr>
          <td>${r.matricula}</td>
          <td>${r.posicao || '—'}</td>
          <td>${r.marca   || '—'}</td>
          <td>${tipoBadge(r.tipo)}</td>
          <td style="text-align:right">${fmt(kmsEf)}</td>
          <td style="text-align:right">${r.escultura_final} mm</td>
          <td style="text-align:right">${taxa} mm/1000km</td>
        </tr>`;
      }).join('');
    }
  }
}
