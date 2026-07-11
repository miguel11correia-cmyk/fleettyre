// ── REBOQUES/FROTA.JS ────────────────────────────────────────────

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
  const { data, error } = await sb
    .from('reboques')
    .select('*')
    .eq('matricula', mat)
    .order('mes_mont', { ascending: true });
  loading(false);
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

  // Custo por mês activo
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
      ? `<div style="display:flex;gap:4px">
           <button class="btn btn-s" onclick="abrirPainelReboque(${r.id})">🔧 Desmontar</button>
           <button class="btn btn-sm" onclick="abrirEdicaoReboque(${r.id})" style="height:28px;padding:0 8px;font-size:11px">✏️</button>
         </div>`
      : `<div style="display:flex;gap:4px">
           <span style="color:var(--text3);font-size:11px">✓ Concluído</span>
           <button class="btn btn-sm" onclick="abrirEdicaoReboque(${r.id})" style="height:28px;padding:0 8px;font-size:11px">✏️</button>
         </div>`;
    return `<tr>
      <td>${r.mes_mont || '—'}</td>
      <td>${r.posicao  || '—'}</td>
      <td>${r.eixo ? 'Eixo ' + r.eixo : '—'}</td>
      <td>${r.marca    || '—'}</td>
      <td>${r.medida   || '—'}</td>
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

// ── PAINEL DESMONTAGEM ────────────────────────────────────────────

async function abrirPainelReboque(id) {
  const { data } = await sb.from('reboques').select('*').eq('id', id).single();
  if (!data) return;
  painelRId = id;
  const hoje = mesAtual();
  const mesesActivo = mesesEntre(data.mes_mont, hoje);
  const lim = LIMITES_EIXO[data.eixo] || LIMITES_EIXO[null];

  document.getElementById('rpainel-info').innerHTML =
    `<strong>${data.matricula}</strong> · ${data.posicao || '—'} · Eixo ${data.eixo || '—'}<br>
     <span style="color:var(--text2)">${data.marca || '—'} ${data.medida || ''} · Montado: ${data.mes_mont} · <strong>${mesesActivo} meses activo</strong></span><br>
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
    showFeedback('rd-feedback', 'Mês inválido. Usa AAAA-MM.', true); return;
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
  document.getElementById('re-pos').value    = data.posicao      || '';
  document.getElementById('re-eixo').value   = data.eixo         || '1';
  document.getElementById('re-marca').value  = data.marca        || '';
  document.getElementById('re-medida').value = data.medida       || '';
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
  const pos    = document.getElementById('re-pos').value.trim().toUpperCase();
  const eixo   = parseInt(document.getElementById('re-eixo').value) || null;
  const marca  = document.getElementById('re-marca').value.trim().toUpperCase();
  const medida = document.getElementById('re-medida').value.trim();
  const tipo   = document.getElementById('re-tipo').value;
  const forn   = document.getElementById('re-forn').value.trim().toUpperCase();
  const custoP = document.getElementById('re-custo').value !== '' ? parseFloat(document.getElementById('re-custo').value) : null;
  const custoMO= document.getElementById('re-mo').value    !== '' ? parseFloat(document.getElementById('re-mo').value)    : null;
  const mesD   = document.getElementById('re-mes-d').value.trim() || null;
  const esc    = document.getElementById('re-esc').value   !== '' ? parseFloat(document.getElementById('re-esc').value)  : null;
  const dest   = document.getElementById('re-dest').value  || null;

  if (!mat) { showFeedback('re-feedback', 'Matrícula é obrigatória.', true); return; }
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) { showFeedback('re-feedback', 'Mês inválido. Usa AAAA-MM.', true); return; }

  const updates = {
    matricula: mat, mes_mont: mes, posicao: pos || null, eixo,
    marca: marca || null, medida: medida || null, tipo: tipo || null,
    fornecedor: forn || null, custo_pneu: custoP, custo_mo: custoMO,
    mes_desmont: mesD, escultura_final: esc, destino: dest,
  };

  loading(true);
  const { error } = await sb.from('reboques').update(updates).eq('id', editRId);
  loading(false);

  if (error) { showFeedback('re-feedback', 'Erro: ' + error.message, true); return; }
  showFeedback('re-feedback', 'Registo actualizado.');
  setTimeout(() => { fecharEdicaoReboque(); loadFrotaReboques(); loadDashboardReboques(); }, 800);
}
