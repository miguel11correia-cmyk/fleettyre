// ── REBOQUES/FROTA.JS ────────────────────────────────────────────

const ICON_REBOQUE = '<svg viewBox="0 0 512 512" width="14" height="14" style="vertical-align:-2px;margin-right:4px"><use href="#icon-trailer"/></svg>';

let painelRId = null;
let painelRIdsBulk = null;
let editRId   = null;
let rfrotaHistoricoExpandido = false;

// ── SELEÇÃO MÚLTIPLA (ver equivalente em frota.js) ─────────────────
let rfrotaSelecionados = new Set();

function toggleRfrotaSel(id) {
  if (rfrotaSelecionados.has(id)) rfrotaSelecionados.delete(id);
  else rfrotaSelecionados.add(id);
  renderRfrotaBulkBar();
}

function limparSelecaoReboque() {
  rfrotaSelecionados = new Set();
  document.querySelectorAll('.rfrota-sel-chk').forEach(c => { c.checked = false; });
  renderRfrotaBulkBar();
}

function renderRfrotaBulkBar() {
  const bar = document.getElementById('rfrota-bulk-bar');
  if (!bar) return;
  const n = rfrotaSelecionados.size;
  bar.classList.toggle('hidden', n === 0);
  const count = document.getElementById('rfrota-bulk-count');
  if (count) count.textContent = n + (n === 1 ? ' selecionado' : ' selecionados');
}

function abrirEdicaoBulkReboque() {
  if (rfrotaSelecionados.size === 0) return;
  abrirEdicaoBulk([...rfrotaSelecionados], 'reboques');
}

function toggleRfrotaHistorico() {
  rfrotaHistoricoExpandido = !rfrotaHistoricoExpandido;
  document.getElementById('rfrota-historico-wrap').classList.toggle('hidden', !rfrotaHistoricoExpandido);
  document.getElementById('rfrota-historico-seta').textContent = rfrotaHistoricoExpandido ? '▾ Recolher' : '▸ Expandir';
}

async function initFrotaSelectReboques() {
  loading(true);
  const { data, error } = await fetchAllRows(() => sb.from('reboques').select('matricula').eq('empresa_id', currentEmpresaId).order('matricula'));
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
    sb.from('reboques').select('*').eq('matricula', mat).eq('empresa_id', currentEmpresaId).order('mes_mont', { ascending: true }),
    sb.from('reboques_frota').select('*').eq('matricula', mat).eq('empresa_id', currentEmpresaId).maybeSingle()
  ]);
  loading(false);

  limparSelecaoReboque();
  renderInfoReboque(reboque, mat);

  if (error || !data) return;

  const activos    = data.filter(r => !r.mes_desmont);
  // Duração dos pneus ACTIVOS (meses desde a montagem até hoje) — é esta
  // que entra no €/mês, não a duração dos já desmontados (esses já não
  // estão a gerar custo nenhum agora).
  const mesesAtivosArr = activos.filter(r => r.mes_mont).map(r => mesesEntre(r.mes_mont, hoje));
  const mesesMedAtivos = mesesAtivosArr.length > 0
    ? Math.round(mesesAtivosArr.reduce((s,v) => s+v, 0) / mesesAtivosArr.length) : null;
  const comCusto       = data.filter(r => r.custo_pneu > 0);
  const custoHistorico = comCusto.reduce((s, r) => s + Number(r.custo_pneu), 0);
  // Só os pneus activos (montados agora) — o histórico completo faria o
  // valor crescer sempre, mesmo sem o custo real por mês ter mudado.
  const custoAtivos    = comCusto.filter(r => !r.mes_desmont).reduce((s, r) => s + Number(r.custo_pneu), 0);
  const custoMes = (custoAtivos > 0 && mesesMedAtivos && mesesMedAtivos > 0)
    ? fmtEur(custoAtivos / mesesMedAtivos) : '—';

  // 5 cartões finais — cada um a responder a uma pergunta real de quem
  // gere a frota (ver README, secção "Cálculos").
  document.getElementById('rfk1').textContent = activos.length;
  document.getElementById('rfk2').textContent = custoMes;
  document.getElementById('rfk3').textContent = custoAtivos > 0 ? fmtEur(custoAtivos) : '—';
  document.getElementById('rfk4').textContent = custoHistorico > 0 ? fmtEur(custoHistorico) : '—';
  document.getElementById('rfk5').textContent = mesesMedAtivos ? mesesMedAtivos + ' meses' : '—';

  // ── Tabelas: lugares fixos (se a configuração for conhecida) + histórico ──
  const slots        = SLOTS_REBOQUE[reboque?.num_eixos];
  const activosArr    = data.filter(r => !r.mes_desmont);
  const historicoArr  = data.filter(r => r.mes_desmont);
  const lugaresCard   = document.getElementById('rfrota-lugares-card');
  const historicoCt   = document.getElementById('rfrota-historico-label');

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
    historicoCt.textContent = 'Histórico: clique em "Desmontar" para registar saída';
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
      <td></td>
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
  const escStr   = r.rasto_final != null ? r.rasto_final + ' mm' : '—';
  const avisoIcon = aviso ? ` <span title="Posição não reconhecida na configuração actual do reboque — edite o registo para corrigir" style="color:var(--red)">⚠</span>` : '';
  const acBtn = `<div style="display:flex;gap:4px;flex-wrap:nowrap">
      <button class="btn btn-s btn-s-brand" onclick="abrirPainelReboque(${r.id})"><svg viewBox="0 0 24 24"><use href="#icon-wrench"/></svg> Desmontar</button>
      <button class="btn btn-sm btn-icon" onclick="abrirEdicaoReboque(${r.id})" title="Editar"><svg viewBox="0 0 24 24"><use href="#icon-edit"/></svg></button>
      ${pdfAnexoBtnHtml('reboques', r.id, r.pdf_path, 'loadFrotaReboques')}
      <button class="btn btn-sm btn-icon btn-danger" onclick="apagarRegistoReboque(${r.id},'${r.matricula}')" title="Apagar"><svg viewBox="0 0 24 24"><use href="#icon-trash"/></svg></button>
    </div>`;
  return `<tr>
    <td><input type="checkbox" class="rfrota-sel-chk" ${rfrotaSelecionados.has(r.id) ? 'checked' : ''} onchange="toggleRfrotaSel(${r.id})"></td>
    <td>${lugar}${avisoIcon}</td>
    <td>${r.marca    || '—'}</td>
    <td>${r.subtipo  || '—'}</td>
    <td>${r.medida   || '—'}</td>
    <td>${r.fornecedor || '—'}</td>
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
  const escStr   = r.rasto_final != null ? r.rasto_final + ' mm' : '—';
  const acBtn    = !r.mes_desmont
    ? `<div style="display:flex;gap:4px;flex-wrap:nowrap">
         <button class="btn btn-s btn-s-brand" onclick="abrirPainelReboque(${r.id})"><svg viewBox="0 0 24 24"><use href="#icon-wrench"/></svg> Desmontar</button>
         <button class="btn btn-sm btn-icon" onclick="abrirEdicaoReboque(${r.id})" title="Editar"><svg viewBox="0 0 24 24"><use href="#icon-edit"/></svg></button>
         ${pdfAnexoBtnHtml('reboques', r.id, r.pdf_path, 'loadFrotaReboques')}
         <button class="btn btn-sm btn-icon btn-danger" onclick="apagarRegistoReboque(${r.id},'${r.matricula}')" title="Apagar"><svg viewBox="0 0 24 24"><use href="#icon-trash"/></svg></button>
       </div>`
    : `<div style="display:flex;gap:4px;flex-wrap:nowrap">
         <span style="color:var(--text3)" title="Desmontado"><svg viewBox="0 0 24 24" style="width:14px;height:14px"><use href="#icon-check"/></svg></span>
         <button class="btn btn-sm btn-icon" onclick="abrirEdicaoReboque(${r.id})" title="Editar"><svg viewBox="0 0 24 24"><use href="#icon-edit"/></svg></button>
         ${pdfAnexoBtnHtml('reboques', r.id, r.pdf_path, 'loadFrotaReboques')}
         <button class="btn btn-sm btn-icon btn-danger" onclick="apagarRegistoReboque(${r.id},'${r.matricula}')" title="Apagar"><svg viewBox="0 0 24 24"><use href="#icon-trash"/></svg></button>
       </div>`;
  return `<tr>
    <td>${!r.mes_desmont ? `<input type="checkbox" class="rfrota-sel-chk" ${rfrotaSelecionados.has(r.id) ? 'checked' : ''} onchange="toggleRfrotaSel(${r.id})">` : ''}</td>
    <td>${r.mes_mont || '—'}</td>
    <td>${r.eixo ? 'Eixo ' + r.eixo : '—'}</td>
    <td>${r.marca    || '—'}</td>
    <td>${r.subtipo  || '—'}</td>
    <td>${r.medida   || '—'}</td>
    <td>${r.fornecedor || '—'}</td>
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

// Atalho do botão "+ Montar" de um lugar vazio: vai direto à aba de
// registo, já no modo Reboque, com a matrícula e a categoria desse
// lugar preenchidas.
async function montarNoLugarReboque(matricula, lugar) {
  toggleSecaoSemCarregar('registos');
  navReg('registo-pneu', document.querySelector('.ni[data-page="registo-pneu"]'));
  await toggleSegmentoRegisto('reboque', true);
  document.getElementById('g-mat').value = matricula;
  atualizarCategoriasPosicao('g-mat', 'g-eixo', listaReboquesFrota, SLOTS_REBOQUE);
  document.getElementById('g-eixo').value = categoriaPosicao(lugar);
  document.getElementById('g-mes').focus();
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
  const { data } = await sb.from('reboques').select('*').eq('id', id).eq('empresa_id', currentEmpresaId).single();
  if (!data) return;
  painelRId = id;
  painelRIdsBulk = null;
  const hoje = mesAtual();
  const mesesActivo = mesesEntre(data.mes_mont, hoje);
  const lim = LIMITES_EIXO[data.eixo] || LIMITES_EIXO[null];

  document.getElementById('rpainel-info').innerHTML =
    `<strong>${data.matricula}</strong> · Eixo ${data.eixo || '—'}<br>
     <span style="color:var(--text2)">${data.marca || '—'} ${data.medida || ''} · Montado: ${data.mes_mont} · <strong>${mesesActivo} meses ativo</strong></span><br>
     <span style="color:${mesesActivo >= lim.critico ? 'var(--red)' : mesesActivo >= lim.aviso ? 'var(--amber)' : 'var(--green)'}">
       Limite eixo ${data.eixo || '?'}: aviso ${lim.aviso}m · crítico ${lim.critico}m
     </span>`;

  ['rd-mes','rd-mo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  // Predefinido a 2.5mm — ponto típico de substituição por segurança/
  // integridade da carcaça (bem acima do mínimo legal de 1.6mm), para
  // não ficar em branco por omissão. O utilizador substitui se souber
  // o valor real medido.
  document.getElementById('rd-esc').value = '2.5';
  document.getElementById('rd-dest').value = 'Remix';
  document.getElementById('rd-feedback').classList.add('hidden');
  document.getElementById('rpainel-desmont').classList.add('open');
}

// Desmontagem de vários pneus de reboque de uma vez (ex: todo um eixo)
// — mesmo painel do botão "Desmontar" individual, com mês/rasto/
// destino/mão de obra aplicados a todos os selecionados.
async function abrirPainelReboqueBulk(ids) {
  if (!ids || ids.length === 0) return;
  const { data } = await sb.from('reboques').select('id,matricula,eixo,marca,medida').in('id', ids).eq('empresa_id', currentEmpresaId);
  const registos = data || [];
  if (registos.length === 0) return;
  painelRId = null;
  painelRIdsBulk = ids;

  const linhas = registos.map(r => `Eixo ${r.eixo || '—'} · ${r.marca || '—'} ${r.medida || ''}`).join('<br>');
  document.getElementById('rpainel-info').innerHTML =
    `<strong>${registos[0].matricula}</strong> · <strong>${registos.length} pneus selecionados</strong><br>
     <span style="color:var(--text2)">${linhas}</span>`;

  ['rd-mes','rd-mo'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('rd-esc').value = '2.5';
  document.getElementById('rd-dest').value = 'Remix';
  document.getElementById('rd-feedback').classList.add('hidden');
  document.getElementById('rpainel-desmont').classList.add('open');
}

function fecharPainelReboque() {
  document.getElementById('rpainel-desmont').classList.remove('open');
  painelRId = null;
  painelRIdsBulk = null;
}

async function guardarDesmontazemReboque() {
  if (painelRIdsBulk) return guardarDesmontazemReboqueBulk();
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
    rasto_final: (esc != null && esc >= 0 && esc <= 25) ? esc : null,
    destino:         dest,
    custo_mo:        mo,
  };

  loading(true);
  const { error } = await sb.from('reboques').update(updates).eq('id', painelRId);
  loading(false);

  if (error) { showFeedback('rd-feedback', 'Erro: ' + error.message, true); return; }
  showFeedback('rd-feedback', 'Desmontagem guardada.');
  setTimeout(() => { fecharPainelReboque(); loadFrotaReboques(); }, 800);
}

async function guardarDesmontazemReboqueBulk() {
  const ids = painelRIdsBulk;
  if (!ids || ids.length === 0) return;

  const mes  = document.getElementById('rd-mes').value.trim();
  const esc  = document.getElementById('rd-esc').value !== '' ? parseFloat(document.getElementById('rd-esc').value) : null;
  const dest = document.getElementById('rd-dest').value;
  const mo   = document.getElementById('rd-mo').value !== '' ? parseFloat(document.getElementById('rd-mo').value) : null;

  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    showFeedback('rd-feedback', 'Mês inválido. Use o formato AAAA-MM.', true); return;
  }

  const updates = {
    mes_desmont: mes,
    rasto_final: (esc != null && esc >= 0 && esc <= 25) ? esc : null,
    destino:     dest,
    custo_mo:    mo,
  };

  loading(true);
  let erros = 0;
  for (const id of ids) {
    const { error } = await sb.from('reboques').update(updates).eq('id', id);
    if (error) erros++;
  }
  loading(false);

  if (erros === 0) {
    showFeedback('rd-feedback', ids.length + ' desmontagens guardadas.');
    setTimeout(() => { fecharPainelReboque(); loadFrotaReboques(); }, 800);
  } else {
    showFeedback('rd-feedback', 'Erro em ' + erros + ' de ' + ids.length + ' registos.', true);
  }
}

// ── EDIÇÃO ────────────────────────────────────────────────────────

async function abrirEdicaoReboque(id) {
  loading(true);
  const { data } = await sb.from('reboques').select('*').eq('id', id).eq('empresa_id', currentEmpresaId).single();
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

  if (!mat) { showFeedback('re-feedback', 'Matrícula é obrigatória.', true); return; }
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) { showFeedback('re-feedback', 'Mês inválido. Use o formato AAAA-MM.', true); return; }

  // Desmontagem não se edita aqui — para isso existe o botão "Desmontar".
  const updates = {
    matricula: mat, mes_mont: mes, eixo, posicao: pos || null,
    marca: marca || null, medida: medida || null, subtipo: subtipo || null, tipo: tipo || null,
    fornecedor: forn || null, custo_pneu: custoP, custo_mo: custoMO,
    custo_total: ((custoP || 0) + (custoMO || 0)) || null,
  };

  loading(true);
  const { error } = await sb.from('reboques').update(updates).eq('id', editRId);
  loading(false);

  if (error) { showFeedback('re-feedback', 'Erro: ' + error.message, true); return; }
  showFeedback('re-feedback', 'Registo atualizado.');
  setTimeout(() => { fecharEdicaoReboque(); loadFrotaReboques(); }, 800);
}

async function apagarRegistoReboque(id, matricula) {
  if (!confirm(`Tem a certeza que quer apagar este registo de ${matricula}? Esta ação não pode ser desfeita.`)) return;
  loading(true);
  const { error } = await sb.from('reboques').delete().eq('id', id);
  loading(false);
  if (error) { alert('Erro ao apagar: ' + error.message); return; }
  loadFrotaReboques();
}
