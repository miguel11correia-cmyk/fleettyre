// ── REBOQUES/ALERTAS.JS ──────────────────────────────────────────

function nivelDuracao(mesesActivo, lim) {
  if (mesesActivo >= lim.critico) return 'critico';
  if (mesesActivo >= lim.aviso)   return 'medio';
  return 'ok';
}

const ALERTASR_NIVEL_INFO = {
  critico: { label: 'crítico', badgeCls: 'b-alert', tituloIcone: '🔴', tituloTxt: 'Reboques com pneus críticos' },
  medio:   { label: 'médio',   badgeCls: 'b-warn',  tituloIcone: '🟡', tituloTxt: 'Reboques com pneus em atenção' },
  ok:      { label: 'ok',      badgeCls: 'b-ok',    tituloIcone: '🟢', tituloTxt: 'Reboques com pneus em bom estado' },
};

let alertasRFiltro = 'critico';
let alertasRPorVeiculo = [];

async function loadAlertasReboques() {
  loading(true);
  const { data, error } = await sb.from('reboques').select('*');
  loading(false);
  if (error || !data) return;

  const hoje    = mesAtual();
  const activos = data.filter(r => !r.mes_desmont && r.mes_mont);

  // Calcular meses ativos e classificar
  const comMeses = activos.map(r => {
    const meses = mesesEntre(r.mes_mont, hoje);
    const lim   = LIMITES_EIXO[r.eixo] || LIMITES_EIXO[null];
    const nivel = nivelDuracao(meses, lim);
    return { ...r, mesesActivo: meses, lim, nivel };
  }).sort((a, b) => b.mesesActivo - a.mesesActivo);

  const criticos = comMeses.filter(r => r.nivel === 'critico');
  const medios   = comMeses.filter(r => r.nivel === 'medio');
  const oks      = comMeses.filter(r => r.nivel === 'ok');

  // Actualizar badge
  const badge = document.getElementById('badge-alertas-r');
  if (badge) {
    badge.textContent = criticos.length;
    badge.classList.toggle('hidden', criticos.length === 0);
  }

  // Agrupar por matrícula — cada reboque aparece em todos os níveis onde tem pelo menos um pneu
  const porMat = {};
  comMeses.forEach(r => {
    if (!porMat[r.matricula]) porMat[r.matricula] = [];
    porMat[r.matricula].push(r);
  });
  alertasRPorVeiculo = Object.keys(porMat).map(mat => {
    const pneus = porMat[mat];
    const pior = pneus.some(p => p.nivel === 'critico') ? 'critico'
               : pneus.some(p => p.nivel === 'medio')   ? 'medio'
               : 'ok';
    return { matricula: mat, pneus, pior };
  });

  // Cartões-resumo
  const stats = {
    critico: { pneus: criticos.length, veiculos: alertasRPorVeiculo.filter(v => v.pneus.some(p => p.nivel === 'critico')).length },
    medio:   { pneus: medios.length,   veiculos: alertasRPorVeiculo.filter(v => v.pneus.some(p => p.nivel === 'medio')).length },
    ok:      { pneus: oks.length,      veiculos: alertasRPorVeiculo.filter(v => v.pneus.some(p => p.nivel === 'ok')).length },
  };
  Object.keys(stats).forEach(n => {
    const v = document.getElementById('ral-n-' + n);
    const s = document.getElementById('ral-s-' + n);
    if (v) v.textContent = stats[n].pneus;
    if (s) s.textContent = `pneus em ${stats[n].veiculos} reboque${stats[n].veiculos === 1 ? '' : 's'}`;
  });

  renderAlertasRVeiculos();

  // ── Histórico de duração ──
  const comHist = data.filter(r => r.mes_desmont && r.mes_mont);
  const tbodyH  = document.getElementById('r-hist-tbody');
  if (tbodyH) {
    if (comHist.length === 0) {
      tbodyH.innerHTML = '<tr><td colspan="7" class="empty-msg" style="text-align:center;padding:12px">Sem desmontagens registadas ainda.</td></tr>';
    } else {
      tbodyH.innerHTML = comHist.map(r => {
        const meses = mesesEntre(r.mes_mont, r.mes_desmont);
        const lim   = LIMITES_EIXO[r.eixo] || LIMITES_EIXO[null];
        const cls   = meses >= lim.critico ? 'badge b-alert' :
                      meses >= lim.aviso   ? 'badge b-warn'  : 'badge b-ok';
        return `<tr>
          <td>${r.matricula}</td>
          <td>${r.eixo ? 'Eixo ' + r.eixo : '—'}</td>
          <td>${r.marca || '—'}</td>
          <td>${tipoBadge(r.tipo)}</td>
          <td><span class="${cls}">${meses} meses</span></td>
          <td>${r.escultura_final != null ? r.escultura_final + '\u202fmm' : '—'}</td>
        </tr>`;
      }).join('');
    }
  }
}

function filtrarAlertasReboques(nivel) {
  alertasRFiltro = nivel;
  renderAlertasRVeiculos();
}

function renderAlertasRVeiculos() {
  document.querySelectorAll('#page-alertas-r .alertas-stat').forEach(el => {
    el.classList.toggle('selected', el.dataset.nivel === alertasRFiltro);
  });

  const info = ALERTASR_NIVEL_INFO[alertasRFiltro];
  const titulo = document.getElementById('alertas-r-lista-titulo');
  if (titulo) titulo.textContent = `${info.tituloIcone} ${info.tituloTxt}`;

  const cont = document.getElementById('alertas-r-lista');
  if (!cont) return;

  const visiveis = alertasRPorVeiculo
    .filter(v => v.pneus.some(p => p.nivel === alertasRFiltro))
    .sort((a, b) => Math.max(...b.pneus.map(p => p.mesesActivo)) - Math.max(...a.pneus.map(p => p.mesesActivo)));

  if (visiveis.length === 0) {
    cont.innerHTML = `<p class="empty-msg">Nenhum reboque com pneus no nível ${info.label}.</p>`;
    return;
  }

  cont.innerHTML = visiveis.map(v => `
    <div class="alerta-veic ${v.pior}" onclick="irParaReboque('${v.matricula}')">
      <div>
        <div class="alerta-veic-mat">${v.matricula}</div>
        <span class="badge ${ALERTASR_NIVEL_INFO[v.pior].badgeCls}">${ALERTASR_NIVEL_INFO[v.pior].label}</span>
      </div>
      <div class="alerta-veic-pneus">
        ${v.pneus.map(p => `<span class="badge ${ALERTASR_NIVEL_INFO[p.nivel].badgeCls}">${p.eixo ? 'Eixo ' + p.eixo : '—'} · ${p.mesesActivo}m</span>`).join('')}
      </div>
    </div>
  `).join('');
}

async function irParaReboque(mat) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('active'));
  document.getElementById('page-frota-r').classList.remove('hidden');
  const btn = document.querySelector('.ni[data-page="frota-r"]');
  if (btn) btn.classList.add('active');
  fecharPainelReboque();
  await initFrotaSelectReboques();
  const sel = document.getElementById('sel-mat-r');
  if (sel) { sel.value = mat; await loadFrotaReboques(); }
}
