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

function kmsReaisOuEstimados(pneu, todosDoCamiao, kmAtualVeiculo) {
  // 0. Km atual real do veículo (integração Cartrack), quando existe —
  // substitui as estimativas abaixo por um valor conhecido em vez de
  // inferido. Sem esta informação (veículo ou frota sem integração),
  // segue-se exactamente a lógica antiga sem qualquer alteração.
  if (kmAtualVeiculo != null && pneu.kms_mont && kmAtualVeiculo > pneu.kms_mont) {
    return kmAtualVeiculo - pneu.kms_mont;
  }

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

function nivelDesgaste(escEstimada) {
  if (escEstimada <= 3) return 'critico';
  if (escEstimada <= 5) return 'medio';
  return 'ok';
}

const ALERTAS_NIVEL_INFO = {
  critico: { label: 'crítico', badgeCls: 'b-alert', tituloIcone: '🔴', tituloTxt: 'Veículos com pneus críticos' },
  medio:   { label: 'médio',   badgeCls: 'b-warn',  tituloIcone: '🟡', tituloTxt: 'Veículos com pneus em atenção' },
  ok:      { label: 'ok',      badgeCls: 'b-ok',    tituloIcone: '🟢', tituloTxt: 'Veículos com pneus em bom estado' },
};

let alertasFiltro = 'critico';
let alertasPorVeiculo = [];

async function loadAlertas() {
  loading(true);
  const [{ data, error }, { data: veiculosData }] = await Promise.all([
    sb.from('pneus').select('*'),
    sb.from('veiculos').select('matricula, km_atual'),
  ]);
  loading(false);
  if (error || !data) return;

  const kmAtualPorMat = {};
  (veiculosData || []).forEach(v => { if (v.km_atual != null) kmAtualPorMat[v.matricula] = v.km_atual; });

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

  // Para cada pneu ativo, calcular KMs reais ou estimados
  const estimativas = [];
  const activos = data.filter(r => !r.mes_desmont && r.mes_mont && r.kms_mont);

  activos.forEach(r => {
    const kmAtualV  = kmAtualPorMat[r.matricula];
    const kmsFeitos = kmsReaisOuEstimados(r, porMat[r.matricula] || [r], kmAtualV);
    const kmReal    = kmAtualV != null && r.kms_mont && kmAtualV > r.kms_mont;
    const taxa      = taxaEstimada(r, taxasPorMTP, taxasPorMT, taxasPorM, todasTaxas);
    const escInicial = escIni(r.tipo);
    const escEstimada = Math.max(0, Math.round((escInicial - (kmsFeitos / 1000 * taxa)) * 10) / 10);
    const nivel = nivelDesgaste(escEstimada);

    estimativas.push({ ...r, kmsFeitos, kmReal, taxa, escEstimada, nivel });
  });

  estimativas.sort((a, b) => a.escEstimada - b.escEstimada);

  const criticos = estimativas.filter(r => r.nivel === 'critico');
  const medios   = estimativas.filter(r => r.nivel === 'medio');
  const oks      = estimativas.filter(r => r.nivel === 'ok');

  // Badge da barra lateral
  const badge = document.getElementById('badge-alertas');
  badge.textContent = criticos.length;
  badge.classList.toggle('hidden', criticos.length === 0);
  document.getElementById('k-alerts').textContent = criticos.length;

  // Agrupar por veículo — cada veículo aparece em todos os níveis onde tem pelo menos um pneu
  const porMatEstim = {};
  estimativas.forEach(r => {
    if (!porMatEstim[r.matricula]) porMatEstim[r.matricula] = [];
    porMatEstim[r.matricula].push(r);
  });
  alertasPorVeiculo = Object.keys(porMatEstim).map(mat => {
    const pneus = porMatEstim[mat];
    const pior = pneus.some(p => p.nivel === 'critico') ? 'critico'
               : pneus.some(p => p.nivel === 'medio')   ? 'medio'
               : 'ok';
    return { matricula: mat, pneus, pior };
  });

  // Cartões-resumo
  const stats = {
    critico: { pneus: criticos.length, veiculos: alertasPorVeiculo.filter(v => v.pneus.some(p => p.nivel === 'critico')).length },
    medio:   { pneus: medios.length,   veiculos: alertasPorVeiculo.filter(v => v.pneus.some(p => p.nivel === 'medio')).length },
    ok:      { pneus: oks.length,      veiculos: alertasPorVeiculo.filter(v => v.pneus.some(p => p.nivel === 'ok')).length },
  };
  Object.keys(stats).forEach(n => {
    const v = document.getElementById('al-n-' + n);
    const s = document.getElementById('al-s-' + n);
    if (v) v.textContent = stats[n].pneus;
    if (s) s.textContent = `pneus em ${stats[n].veiculos} veículo${stats[n].veiculos === 1 ? '' : 's'}`;
  });

  renderAlertasVeiculos();

  // Tabela completa
  const tbody = document.getElementById('desgaste-tbody');
  if (tbody) {
    tbody.innerHTML = estimativas.map(r => {
      const escCls = 'badge ' + ALERTAS_NIVEL_INFO[r.nivel].badgeCls;
      return `<tr>
        <td>${r.matricula}</td>
        <td>${r.posicao || '—'}</td>
        <td>${r.marca   || '—'}</td>
        <td>${tipoBadge(r.tipo)}</td>
        <td style="text-align:right">${fmt(r.kmsFeitos)}${r.kmReal ? ' 📡' : ''}</td>
        <td><span class="${escCls}">${r.escEstimada} mm</span></td>
        <td style="text-align:right">${r.taxa.toFixed(3)} mm/1000km</td>
      </tr>`;
    }).join('');
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

function filtrarAlertas(nivel) {
  alertasFiltro = nivel;
  renderAlertasVeiculos();
}

function renderAlertasVeiculos() {
  document.querySelectorAll('#page-alertas .alertas-stat').forEach(el => {
    el.classList.toggle('selected', el.dataset.nivel === alertasFiltro);
  });

  const info = ALERTAS_NIVEL_INFO[alertasFiltro];
  const titulo = document.getElementById('alertas-lista-titulo');
  if (titulo) titulo.textContent = `${info.tituloIcone} ${info.tituloTxt}`;

  const cont = document.getElementById('alertas-veiculos');
  if (!cont) return;

  const visiveis = alertasPorVeiculo
    .filter(v => v.pneus.some(p => p.nivel === alertasFiltro))
    .sort((a, b) => Math.min(...a.pneus.map(p => p.escEstimada)) - Math.min(...b.pneus.map(p => p.escEstimada)));

  if (visiveis.length === 0) {
    cont.innerHTML = `<p class="empty-msg">Nenhum veículo com pneus no nível ${info.label}.</p>`;
    return;
  }

  cont.innerHTML = visiveis.map(v => `
    <div class="alerta-veic ${v.pior}" onclick="irParaVeiculo('${v.matricula}')">
      <div>
        <div class="alerta-veic-mat">${v.matricula}</div>
        <span class="badge ${ALERTAS_NIVEL_INFO[v.pior].badgeCls}">${ALERTAS_NIVEL_INFO[v.pior].label}</span>
      </div>
      <div class="alerta-veic-pneus">
        ${v.pneus.map(p => `<span class="badge ${ALERTAS_NIVEL_INFO[p.nivel].badgeCls}">${p.posicao || '—'} · ${p.escEstimada}mm${p.kmReal ? ' 📡' : ''}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

async function irParaVeiculo(mat) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('active'));
  document.getElementById('page-frota').classList.remove('hidden');
  const btn = document.querySelector('.ni[data-page="frota"]');
  if (btn) btn.classList.add('active');
  fecharPainel();
  await initFrotaSelect();
  const sel = document.getElementById('sel-mat');
  if (sel) { sel.value = mat; await loadFrota(); }
}

function toggleTabelaDesgaste() {
  const wrap  = document.getElementById('tabela-desgaste-wrap');
  const label = document.getElementById('tabela-desgaste-toggle');
  wrap.classList.toggle('hidden');
  label.textContent = wrap.classList.contains('hidden') ? '▸ Expandir' : '▾ Recolher';
}
