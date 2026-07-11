// ── ALERTAS ──────────────────────────────────────────────

function kmsMediaMensal(registosMat) {
  // Ordenar por kms_mont
  const ordenados = [...registosMat]
    .filter(r => r.kms_mont)
    .sort((a, b) => a.kms_mont - b.kms_mont);

  if (ordenados.length < 2) {
    // Só um registo — usar diferença entre montagem e hoje
    const r = ordenados[0];
    if (!r) return null;
    const mesesPassados = mesesEntre(r.mes_mont, mesAtual());
    if (mesesPassados <= 0) return null;
    // Estimativa conservadora: 8000km/mês (média sector pesados PT)
    return 8000;
  }

  // Calcular KMs/mês entre montagens consecutivas
  const taxas = [];
  for (let i = 1; i < ordenados.length; i++) {
    const kmsDif = ordenados[i].kms_mont - ordenados[i-1].kms_mont;
    const mesesDif = mesesEntre(ordenados[i-1].mes_mont, ordenados[i].mes_mont);
    if (kmsDif > 0 && mesesDif > 0) {
      taxas.push(kmsDif / mesesDif);
    }
  }

  if (taxas.length === 0) return 8000; // fallback

  // Média das taxas, excluindo outliers extremos (< 500 ou > 30000 km/mês)
  const validas = taxas.filter(t => t >= 500 && t <= 30000);
  if (validas.length === 0) return 8000;
  return validas.reduce((s, v) => s + v, 0) / validas.length;
}

function calcularTaxasPorMarcaTipo(dados) {
  const taxas = {};
  dados.forEach(r => {
    const t = taxaDesgaste(r);
    if (t === null) return;
    const chave = `${r.marca || 'DESCONHECIDA'}|${r.tipo || 'Novo'}`;
    if (!taxas[chave]) taxas[chave] = [];
    taxas[chave].push(t);
  });

  // Média por chave
  const medias = {};
  Object.keys(taxas).forEach(k => {
    const arr = taxas[k];
    medias[k] = arr.reduce((s, v) => s + v, 0) / arr.length;
  });
  return medias;
}

function taxaEstimada(r, taxasPorMarcaTipo, todasTaxas) {
  const chave = `${r.marca || 'DESCONHECIDA'}|${r.tipo || 'Novo'}`;
  if (taxasPorMarcaTipo[chave]) return taxasPorMarcaTipo[chave];

  // Fallback: mesma marca, qualquer tipo
  const chavesMarca = Object.keys(taxasPorMarcaTipo).filter(k => k.startsWith((r.marca || 'DESCONHECIDA') + '|'));
  if (chavesMarca.length > 0) {
    const vals = chavesMarca.map(k => taxasPorMarcaTipo[k]);
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  }

  // Fallback: média geral
  if (todasTaxas.length > 0) {
    return todasTaxas.reduce((s, v) => s + v, 0) / todasTaxas.length;
  }

  // Fallback padrão sector pesados
  return 0.08;
}

async function loadAlertas() {
  loading(true);
  const { data, error } = await sb.from('pneus').select('*');
  loading(false);
  if (error || !data) return;

  const hoje = mesAtual();

  // ── 1. Calcular taxas de desgaste a partir do histórico ──
  const taxasPorMarcaTipo = calcularTaxasPorMarcaTipo(data);
  const todasTaxas = data.map(r => taxaDesgaste(r)).filter(t => t !== null);

  // ── 2. Agrupar registos por matrícula para calcular KMs/mês ──
  const porMat = {};
  data.forEach(r => {
    if (!porMat[r.matricula]) porMat[r.matricula] = [];
    porMat[r.matricula].push(r);
  });

  // ── 3. Para cada pneu ACTIVO, estimar escultura actual ──
  const estimativas = [];
  const activos = data.filter(r => !r.mes_desmont && r.mes_mont);

  activos.forEach(r => {
    const mesesDecorridos = mesesEntre(r.mes_mont, hoje);
    if (mesesDecorridos < 0) return;

    const kmsMes = kmsMediaMensal(porMat[r.matricula] || [r]);
    const kmsEstimados = mesesDecorridos * kmsMes;
    const taxa = taxaEstimada(r, taxasPorMarcaTipo, todasTaxas);
    const escInicial = escIni(r.tipo);
    const escEstimada = escInicial - (kmsEstimados / 1000 * taxa);

    estimativas.push({
      ...r,
      mesesDecorridos,
      kmsEstimados: Math.round(kmsEstimados),
      kmsMes: Math.round(kmsMes),
      taxa: taxa,
      escEstimada: Math.max(0, Math.round(escEstimada * 10) / 10),
    });
  });

  // Ordenar por escultura estimada (mais urgente primeiro)
  estimativas.sort((a, b) => a.escEstimada - b.escEstimada);

  // ── 4. Alertas críticos (escultura estimada ≤ 3mm) ──
  const criticos = estimativas.filter(r => r.escEstimada <= 3);
  const aviso    = estimativas.filter(r => r.escEstimada > 3 && r.escEstimada <= 5);

  // Actualizar badge no menu
  const badge = document.getElementById('badge-alertas');
  badge.textContent = criticos.length;
  badge.classList.toggle('hidden', criticos.length === 0);
  document.getElementById('k-alerts').textContent = criticos.length;

  // ── 5. Renderizar alertas críticos ──
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
          <span class="alerta-det">${r.marca || '—'} ${r.medida || ''} · ${r.tipo || '—'} · Mont.: ${r.mes_mont} · ~${fmt(r.kmsEstimados)} km estimados</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="prog"><div class="prog-fill" style="width:${pct}%;background:${cor}"></div></div>
          <span class="badge b-alert">~${r.escEstimada} mm</span>
        </div>
      </div>`;
    }).join('');
  }

  // ── 6. Tabela completa de estimativas (todos os activos) ──
  const tbody = document.getElementById('desgaste-tbody');
  if (estimativas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-msg" style="text-align:center;padding:12px">Sem pneus activos para estimar.</td></tr>';
  } else {
    tbody.innerHTML = estimativas.map(r => {
      const escCls = r.escEstimada <= 3 ? 'badge b-alert' :
                     r.escEstimada <= 5 ? 'badge b-warn'  : '';
      return `<tr>
        <td>${r.matricula}</td>
        <td>${r.posicao || '—'}</td>
        <td>${r.marca   || '—'}</td>
        <td>${tipoBadge(r.tipo)}</td>
        <td style="text-align:right">${r.mes_mont}</td>
        <td style="text-align:right">${fmt(r.kmsEstimados)}</td>
        <td style="text-align:right">${r.taxa.toFixed(3)} mm/1000km</td>
        <td><span class="${escCls}">${r.escEstimada} mm</span></td>
      </tr>`;
    }).join('');
  }

  // ── 7. Secção de avisos (3-5mm) ──
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
          <span class="badge b-warn">~${r.escEstimada} mm</span>
        </div>
      </div>`).join('');
    }
  }

  // ── 8. Tabela de taxas históricas usadas ──
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
          <td style="text-align:right">${r.escultura_final} mm</td>
          <td style="text-align:right">${taxa} mm/1000km</td>
        </tr>`;
      }).join('');
    }
  }
}

