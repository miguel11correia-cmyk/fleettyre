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

  // ── Tabelas: lugares fixos (se a configuração for conhecida) + histórico ──
  const slots        = SLOTS_REBOQUE[reboque?.num_eixos];
  const activosArr    = data.filter(r => !r.mes_desmont);
  const historicoArr  = data.filter(r => r.mes_desmont);
  const lugaresCard   = document.getElementById('rfrota-lugares-card');
  const historicoCt   = document.getElementById('rfrota-historico-ct');

  if (slots) {
    lugaresCard.classList.remove('hidden');
    historicoCt.textContent = 'Histórico';

    const porLugar = {};
    activosArr.forEach(r => { porLugar[r.posicao] = r; });
    const semLugar = activosArr.filter(r => !slots.includes(r.posicao));

    document.getElementById('rfrota-lugares-tbody').innerHTML =
      slots.map(lugar => linhaLugarReboque(lugar, porLugar[lugar], mat, hoje)).join('') +
      semLugar.map(r => linhaLugarReboque(r.posicao || (r.eixo ? 'Eixo ' + r.eixo : '(sem posição)'), r, mat, hoje, true)).join('');

    document.getElementById('rfrota-tbody').innerHTML = historicoArr.map(r => linhaHistoricoReboque(r, hoje)).join('');
  } else {
    lugaresCard.classList.add('hidden');
    historicoCt.textContent = 'Histórico — clique em "Desmontar" para registar saída';
    document.getElementById('rfrota-tbody').innerHTML = data.map(r => linhaHistoricoReboque(r, hoje)).join('');
  }
}

// Uma linha da tabela "Lugares" — preenchida com o pneu activo desse
// lugar, ou vazia com um botão para montar. `aviso=true` assinala um
// pneu activo cujo lugar não corresponde à configuração actual do
// reboque (raro — só acontece com dados que o backfill não conseguiu
// mapear automaticamente).
function linhaLugarReboque(lugar, r, mat, hoje, aviso) {
  if (!r) {
    return `<tr style="color:var(--text3)">
      <td>${lugar}</td>
      <td colspan="10">— vazio —</td>
      <td><button class="btn btn-sm" onclick="montarNoLugarReboque('${mat}','${lugar}')"><svg viewBox="0 0 24 24"><use href="#icon-plus"/></svg> Montar</button></td>
    </tr>`;
  }
  const mesesActivo = mesesEntre(r.mes_mont, hoje);
  const lim = LIMITES_EIXO[r.eixo] || LIMITES_EIXO[null];
  const alertCls = mesesActivo >= lim.critico ? 'b-alert' :
                   mesesActivo >= lim.aviso   ? 'b-warn'  : '';
  const mesesStr = `<span class="${alertCls ? 'badge ' + alertCls : ''}">${mesesActivo} meses</span>`;
  const escStr   = r.escultura_final != null ? r.escultura_final + ' mm' : '—';
  const avisoIcon = aviso ? ` <span title="Posição não reconhecida na configuração actual do reboque — edite o registo para corrigir" style="color:var(--red)">⚠</span>` : '';
  const acBtn = `<div style="display:flex;gap:4px;flex-wrap:wrap">
      <button class="btn btn-s" onclick="abrirPainelReboque(${r.id})"><svg viewBox="0 0 24 24"><use href="#icon-wrench"/></svg> Desmontar</button>
      <button class="btn btn-sm btn-icon" onclick="abrirEdicaoReboque(${r.id})" title="Editar"><svg viewBox="0 0 24 24"><use href="#icon-edit"/></svg></button>
      <button class="btn btn-sm btn-icon btn-danger" onclick="apagarRegistoReboque(${r.id},'${r.matricula}')" title="Apagar"><svg viewBox="0 0 24 24"><use href="#icon-trash"/></svg></button>
    </div>`;
  return `<tr>
    <td>${lugar}${avisoIcon}</td>
    <td>${r.marca    || '—'}</td>
    <td>${r.fornecedor || '—'}</td>
    <td>${r.medida   || '—'}</td>
    <td>${r.subtipo  || '—'}</td>
    <td>${tipoBadge(r.tipo)}</td>
    <td>${r.mes_mont || '—'}</td>
    <td>${mesesStr}</td>
    <td>${escStr}</td>
    <td style="text-align:right">${r.custo_pneu > 0 ? fmtEur(r.custo_pneu) : '—'}</td>
    <td style="text-align:right">${r.custo_mo > 0 ? fmtEur(r.custo_mo) : '—'}</td>
    <td>${acBtn}</td>
  </tr>`;
}

// Uma linha da tabela "Histórico" (ou da tabela única, para reboques
// sem configuração conhecida — mesmo comportamento de sempre).
function linhaHistoricoReboque(r, hoje) {
  const mesesActivo = mesesEntre(r.mes_mont, r.mes_desmont || hoje);
  const lim = LIMITES_EIXO[r.eixo] || LIMITES_EIXO[null];
  const alertCls = mesesActivo >= lim.critico ? 'b-alert' :
                   mesesActivo >= lim.aviso   ? 'b-warn'  : '';
  const mesesStr = `<span class="${alertCls ? 'badge ' + alertCls : ''}">${mesesActivo} meses</span>`;
  const escStr   = r.escultura_final != null ? r.escultura_final + ' mm' : '—';
  const acBtn    = !r.mes_desmont
    ? `<div style="display:flex;gap:4px;flex-wrap:wrap">
         <button class="btn btn-s" onclick="abrirPainelReboque(${r.id})"><svg viewBox="0 0 24 24"><use href="#icon-wrench"/></svg> Desmontar</button>
         <button class="btn btn-sm btn-icon" onclick="abrirEdicaoReboque(${r.id})" title="Editar"><svg viewBox="0 0 24 24"><use href="#icon-edit"/></svg></button>
         <button class="btn btn-sm btn-icon btn-danger" onclick="apagarRegistoReboque(${r.id},'${r.matricula}')" title="Apagar"><svg viewBox="0 0 24 24"><use href="#icon-trash"/></svg></button>
       </div>`
    : `<div style="display:flex;gap:4px;flex-wrap:wrap">
         <span style="color:var(--text3)" title="Desmontado"><svg viewBox="0 0 24 24" style="width:14px;height:14px"><use href="#icon-check"/></svg></span>
         <button class="btn btn-sm btn-icon" onclick="abrirEdicaoReboque(${r.id})" title="Editar"><svg viewBox="0 0 24 24"><use href="#icon-edit"/></svg></button>
         <button class="btn btn-sm btn-icon btn-danger" onclick="apagarRegistoReboque(${r.id},'${r.matricula}')" title="Apagar"><svg viewBox="0 0 24 24"><use href="#icon-trash"/></svg></button>
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
}

// Atalho do botão "+ Montar" de um lugar vazio: abre "Registar pneu"
// (reboques) com a matrícula e a categoria desse lugar já preenchidas.
function montarNoLugarReboque(matricula, lugar) {
  navR('registar-r', document.querySelector('[data-page="registar-r"]'));
  const selMat = document.getElementById('rr-mat');
  selMat.value = matricula;
  atualizarCategoriasPosicao('rr-mat', 'rr-eixo', listaReboquesFrota, SLOTS_REBOQUE);
  document.getElementById('rr-eixo').value = categoriaPosicao(lugar);
  document.getElementById('rr-mes').focus();
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
      <div><span style="font-size:11px;color:var(--text3)">Marca</span><br>${renderMarcaComLogoReboque(v.marca)}</div>
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
  const reboqueEd = listaReboquesFrota.find(v => v.matricula === data.matricula);
  await atualizarLugaresEdicao('re-pos', 'reboques', data.matricula, data.posicao || (data.eixo ? 'Eixo ' + data.eixo : ''), reboqueEd?.num_eixos, SLOTS_REBOQUE, data.id);
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
  const pos    = document.getElementById('re-pos').value;
  const eixo   = eixoDoLugar(pos);
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
    matricula: mat, mes_mont: mes, eixo, posicao: pos || null,
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
