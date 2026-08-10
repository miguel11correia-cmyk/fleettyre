// ── REBOQUES/FROTA.JS ────────────────────────────────────────────

const ICON_REBOQUE = '<svg viewBox="0 0 15 15" width="14" height="14" style="vertical-align:-2px;margin-right:4px"><use href="#icon-trailer"/></svg>';

let painelRId = null;
let editRId   = null;

async function initFrotaSelectReboques() {
  loading(true);
  const { data, error } = await sb.from('reboques').select('matricula').order('matricula');
  loading(false);
  if (error || !data) return;

  const mats = [...new Set(data.map(r => r.matricula))].sort();
  const sel  = document.getElementById('sel-mat-r');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = mats.map(m => `<option value="${m}"${m === prev ? ' selected' : ''}>${m}</option>`).join('');
  if (mats.length > 0) await loadFrotaReboques();
}

async function loadFrotaReboques() {
  const mat = document.getElementById('sel-mat-r').value;
  if (!mat) return;
  const hoje = mesAtual();

  loading(true);
  const [{ data, error }, { data: reboque }] = await Promise.all([
    sb.from('reboques').select('*').eq('matricula', mat).order('mes_mont', { ascending: true }),
    sb.from('reboques_frota').select('*').eq('matricula', mat).maybeSingle()
  ]);
  loading(false);

  renderInfoReboque(reboque, mat);

  if (error || !data) return;

  const activos    = data.filter(r => !r.mes_desmont);
  const comMeses   = data.filter(r => r.mes_desmont && r.mes_mont);
  const mesesArr   = comMeses.map(r => mesesEntre(r.mes_mont, r.mes_desmont));
  const mesesMed   = mesesArr.length > 0 ? Math.round(mesesArr.reduce((s,v) => s+v, 0) / mesesArr.length) : null;
  const comCusto   = data.filter(r => r.custo_pneu > 0);
  const custoTotal = comCusto.reduce((s, r) => s + Number(r.custo_pneu), 0);
  const custoMed   = comCusto.length > 0 ? custoTotal / comCusto.length : null;

  document.getElementById('rfk1').textContent = data.length;
  document.getElementById('rfk2').textContent = activos.length;
  document.getElementById('rfk3').textContent = mesesMed ? mesesMed + ' meses' : '—';
  document.getElementById('rfk4').textContent = custoTotal > 0 ? fmtEur(custoTotal) : '—';
  document.getElementById('rfk5').textContent = custoMed ? fmtEur(custoMed) : '—';

  // Custo por mês ativo
  const custoMes = (custoMed && mesesMed && mesesMed > 0)
    ? fmtEur(custoMed / mesesMed) : '—';
  document.getElementById('rfk6').textContent = custoMes;

  const tbody = document.getElementById('rfrota-tbody');
  tbody.innerHTML = data.map(r => {
    const mesesActivo = mesesEntre(r.mes_mont, r.mes_desmont || hoje);
    const lim = LIMITES_EIXO[r.eixo] || LIMITES_EIXO[null];
    const alertCls = mesesActivo >= lim.critico ? 'b-alert' :
                     mesesActivo >= lim.aviso   ? 'b-warn'  : '';
    const mesesStr = `<span class="${alertCls ? 'badge ' + alertCls : ''}">${mesesActivo} meses</span>`;
    const escStr   = r.escultura_final != null ? r.escultura_final + '\u202fmm' : '—';
    const acBtn    = !r.mes_desmont
      ? `<div style="display:flex;gap:4px;flex-wrap:wrap">
           <button class="btn btn-s" onclick="abrirPainelReboque(${r.id})">🔧 Desmontar</button>
           <button class="btn btn-sm" onclick="abrirEdicaoReboque(${r.id})" style="height:28px;padding:0 8px;font-size:11px">✏️</button>
           <button class="btn btn-sm" onclick="apagarRegistoReboque(${r.id},'${r.matricula}')" style="height:28px;padding:0 8px;font-size:11px;color:var(--red);border-color:#f5c6c6">🗑</button>
         </div>`
      : `<div style="display:flex;gap:4px;flex-wrap:wrap">
           <span style="color:var(--text3);font-size:11px">✓</span>
           <button class="btn btn-sm" onclick="abrirEdicaoReboque(${r.id})" style="height:28px;padding:0 8px;font-size:11px">✏️</button>
           <button class="btn btn-sm" onclick="apagarRegistoReboque(${r.id},'${r.matricula}')" style="height:28px;padding:0 8px;font-size:11px;color:var(--red);border-color:#f5c6c6">🗑</button>
         </div>`;
    return `<tr>
      <td>${r.mes_mont || '—'}</td>
      <td>${r.eixo ? 'Eixo ' + r.eixo : '—'}</td>
      <td>${r.marca    || '—'}</td>
      <td>${r.fornecedor || '—'}</td>
      <td>${r.medida   || '—'}</td>
      <td>${r.subtipo  || '—'}</td>
      <td>${tipoBadge(r.tipo)}</td>
      <td>${mesesStr}</td>
      <td>${r.mes_desmont || '—'}</td>
      <td>${escStr}</td>
      <td>${r.destino  || '—'}</td>
      <td style="text-align:right">${r.custo_pneu > 0 ? fmtEur(r.custo_pneu) : '—'}</td>
      <td style="text-align:right">${r.custo_mo > 0 ? fmtEur(r.custo_mo) : '—'}</td>
      <td style="text-align:right">${r.custo_total > 0 ? fmtEur(r.custo_total) : '—'}</td>
      <td>${acBtn}</td>
    </tr>`;
  }).join('');
}

function renderInfoReboque(v, mat) {
  const el = document.getElementById('frota-info-reboque');
  if (!el) return;

  if (!v) {
    el.innerHTML = `<div class="ct">${ICON_REBOQUE}${mat}</div>
      <p style="font-size:12px;color:var(--text3)">Sem ficha de reboque registada em "Frota".</p>`;
    return;
  }

  el.innerHTML = `
    <div class="ct">${ICON_REBOQUE}${v.matricula}</div>
    <div class="g3" style="margin-bottom:0">
      <div><span style="font-size:11px;color:var(--text3)">Marca</span><br>${v.marca || '—'}</div>
      <div><span style="font-size:11px;color:var(--text3)">Modelo</span><br>${v.modelo || '—'}</div>
      <div><span style="font-size:11px;color:var(--text3)">Ano</span><br>${v.ano || '—'}</div>
    </div>
    <div class="g2" style="margin-bottom:0">
      <div><span style="font-size:11px;color:var(--text3)">Tipo</span><br>${v.tipo || '—'}</div>
      <div><span style="font-size:11px;color:var(--text3)">Configuração eixos</span><br>${v.num_eixos || '—'}</div>
    </div>`;
}

// ── PAINEL DESMONTAGEM ────────────────────────────────────────────

async function abrirPainelReboque(id) {
  const { data } = await sb.from('reboques').select('*').eq('id', id).single();
  if (!data) return;
  painelRId = id;
  const hoje = mesAtual();
  const mesesActivo = mesesEntre(data.mes_mont, hoje);
  const lim = LIMITES_EIXO[data.eixo] || LIMITES_EIXO[null];

  document.getElementById('rpainel-info').innerHTML =
    `<strong>${data.matricula}</strong> · Eixo ${data.eixo || '—'}<br>
     <span style="color:var(--text2)">${data.marca || '—'} ${data.medida || ''} · Montado: ${data.mes_mont} · <strong>${mesesActivo} meses ativo</strong></span><br>
     <span style="color:${mesesActivo >= lim.critico ? 'var(--red)' : mesesActivo >= lim.aviso ? 'var(--amber)' : 'var(--green)'}">
       Limite eixo ${data.eixo || '?'}: aviso ${lim.aviso}m · crítico ${lim.critico}m
     </span>`;

  ['rd-mes','rd-esc','rd-mo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('rd-dest').value = 'Remix';
  document.getElementById('rd-feedback').classList.add('hidden');
  document.getElementById('rpainel-desmont').classList.add('open');
}

function fecharPainelReboque() {
  document.getElementById('rpainel-desmont').classList.remove('open');
  painelRId = null;
}

async function guardarDesmontazemReboque() {
  if (painelRId == null) return;
  const mes  = document.getElementById('rd-mes').value.trim();
  const esc  = document.getElementById('rd-esc').value !== '' ? parseFloat(document.getElementById('rd-esc').value) : null;
  const dest = document.getElementById('rd-dest').value;
  const mo   = document.getElementById('rd-mo').value !== '' ? parseFloat(document.getElementById('rd-mo').value) : null;

  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    showFeedback('rd-feedback', 'Mês inválido. Use o formato AAAA-MM.', true); return;
  }

  const updates = {
    mes_desmont:     mes,
    escultura_final: (esc != null && esc >= 0 && esc <= 25) ? esc : null,
    destino:         dest,
    custo_mo:        mo,
  };

  loading(true);
  const { error } = await sb.from('reboques').update(updates).eq('id', painelRId);
  loading(false);

  if (error) { showFeedback('rd-feedback', 'Erro: ' + error.message, true); return; }
  showFeedback('rd-feedback', 'Desmontagem guardada.');
  setTimeout(() => { fecharPainelReboque(); loadFrotaReboques(); loadDashboardReboques(); }, 800);
}

// ── EDIÇÃO ────────────────────────────────────────────────────────

async function abrirEdicaoReboque(id) {
  loading(true);
  const { data } = await sb.from('reboques').select('*').eq('id', id).single();
  loading(false);
  if (!data) return;
  editRId = id;

  document.getElementById('re-mat').value    = data.matricula    || '';
  document.getElementById('re-mes').value    = data.mes_mont     || '';
  document.getElementById('re-eixo').value   = data.eixo         || '1';
  document.getElementById('re-marca').value  = data.marca        || '';
  document.getElementById('re-medida').value = data.medida       || '';
  popularSelectorSubtipo('re-marca', 're-subtipo');
  document.getElementById('re-subtipo').value = data.subtipo     || '';
  document.getElementById('re-tipo').value   = data.tipo         || 'Novo';
  document.getElementById('re-forn').value   = data.fornecedor   || '';
  document.getElementById('re-custo').value  = data.custo_pneu   > 0 ? data.custo_pneu : '';
  document.getElementById('re-mo').value     = data.custo_mo     > 0 ? data.custo_mo   : '';
  document.getElementById('re-mes-d').value  = data.mes_desmont  || '';
  document.getElementById('re-esc').value    = data.escultura_final != null ? data.escultura_final : '';
  document.getElementById('re-dest').value   = data.destino      || '';

  document.getElementById('re-feedback').classList.add('hidden');
  document.getElementById('rpainel-editar').classList.add('open');
}

function fecharEdicaoReboque() {
  document.getElementById('rpainel-editar').classList.remove('open');
  editRId = null;
}

async function guardarEdicaoReboque() {
  if (editRId == null) return;
  const mat    = document.getElementById('re-mat').value.trim().toUpperCase();
  const mes    = document.getElementById('re-mes').value.trim();
  const eixo   = parseInt(document.getElementById('re-eixo').value) || null;
  const marca  = document.getElementById('re-marca').value.trim().toUpperCase();
  const medida = document.getElementById('re-medida').value.trim();
  const subtipo= document.getElementById('re-subtipo').value.trim();
  const tipo   = document.getElementById('re-tipo').value;
  const forn   = document.getElementById('re-forn').value.trim().toUpperCase();
  const custoP = document.getElementById('re-custo').value !== '' ? parseFloat(document.getElementById('re-custo').value) : null;
  const custoMO= document.getElementById('re-mo').value    !== '' ? parseFloat(document.getElementById('re-mo').value)    : null;
  const mesD   = document.getElementById('re-mes-d').value.trim() || null;
  const esc    = document.getElementById('re-esc').value   !== '' ? parseFloat(document.getElementById('re-esc').value)  : null;
  const dest   = document.getElementById('re-dest').value  || null;

  if (!mat) { showFeedback('re-feedback', 'Matrícula é obrigatória.', true); return; }
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) { showFeedback('re-feedback', 'Mês inválido. Use o formato AAAA-MM.', true); return; }

  const updates = {
    matricula: mat, mes_mont: mes, eixo,
    marca: marca || null, medida: medida || null, subtipo: subtipo || null, tipo: tipo || null,
    fornecedor: forn || null, custo_pneu: custoP, custo_mo: custoMO,
    custo_total: ((custoP || 0) + (custoMO || 0)) || null,
    mes_desmont: mesD, escultura_final: esc, destino: dest,
  };

  loading(true);
  const { error } = await sb.from('reboques').update(updates).eq('id', editRId);
  loading(false);

  if (error) { showFeedback('re-feedback', 'Erro: ' + error.message, true); return; }
  showFeedback('re-feedback', 'Registo atualizado.');
  setTimeout(() => { fecharEdicaoReboque(); loadFrotaReboques(); loadDashboardReboques(); }, 800);
}

async function apagarRegistoReboque(id, matricula) {
  if (!confirm(`Tem a certeza que quer apagar este registo de ${matricula}? Esta ação não pode ser desfeita.`)) return;
  loading(true);
  const { error } = await sb.from('reboques').delete().eq('id', id);
  loading(false);
  if (error) { alert('Erro ao apagar: ' + error.message); return; }
  loadFrotaReboques();
  loadDashboardReboques();
}
