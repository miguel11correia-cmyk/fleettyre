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

// €/mês de um eixo — custo MÉDIO por pneu desse eixo ÷ duração média por
// pneu (meses desde a montagem até hoje). Tem de ser média por pneu, não
// soma: configurações de rodado duplo têm o dobro dos pneus por eixo,
// por isso somar o custo de todos inflava sempre o €/mês desses eixos.
function eurMesPorEixo(activos, eixo, hoje) {
  const ativosEixo = activos.filter(r => r.eixo === eixo);
  const mesesArr = ativosEixo.filter(r => r.mes_mont).map(r => mesesEntre(r.mes_mont, hoje));
  const mesesMed = mesesArr.length > 0 ? mesesArr.reduce((s, v) => s + v, 0) / mesesArr.length : null;
  const comCusto = ativosEixo.filter(r => r.custo_pneu > 0);
  const custoMed = comCusto.length > 0 ? comCusto.reduce((s, r) => s + Number(r.custo_pneu), 0) / comCusto.length : null;
  return (custoMed && custoMed > 0 && mesesMed && mesesMed > 0) ? fmtEur(custoMed / mesesMed) : '—';
}

// Clique no card "Mais urgente" — vai direto a Alertas (Reboques) já
// filtrado pelo nível do pneu mostrado no card.
function irParaMaisUrgenteReboque() {
  const nivel = document.getElementById('rfk5-card').dataset.nivel;
  if (!nivel) return;
  toggleSecaoSemCarregar('reboques');
  navR('alertas-r', document.querySelector('.ni[data-page="alertas-r"]'));
  loadAlertasReboques().then(() => filtrarAlertasReboques(nivel));
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
  const comCusto       = data.filter(r => r.custo_pneu > 0);
  const custoHistorico = comCusto.reduce((s, r) => s + Number(r.custo_pneu), 0);
  // Só os pneus activos (montados agora) — o histórico completo faria o
  // valor crescer sempre, mesmo sem o custo real por mês ter mudado.
  const custoAtivos    = comCusto.filter(r => !r.mes_desmont).reduce((s, r) => s + Number(r.custo_pneu), 0);

  // €/mês separado por eixo — Eixo 2 aguenta muito mais tempo que Eixo 1/3
  // (ver LIMITES_EIXO), por isso uma média única escondia qual dos três
  // estava de facto a pesar mais no custo.
  document.getElementById('rfk2-e1').textContent = eurMesPorEixo(activos, 1, hoje);
  document.getElementById('rfk2-e2').textContent = eurMesPorEixo(activos, 2, hoje);
  document.getElementById('rfk2-e3').textContent = eurMesPorEixo(activos, 3, hoje);

  // Pneu activo mais urgente — não é o de mais meses em absoluto, é o
  // mais perto do limite crítico DO SEU eixo (Eixo 2 aguenta muito mais
  // do que Eixo 1/3, ver LIMITES_EIXO), tal como o "Mais urgente" de
  // "Por veículo" usa o rasto estimado em vez dos KMs em bruto.
  const comAlertas = calcularAlertasReboques(data);
  let maisUrgenteR = null;
  comAlertas.forEach(r => {
    const margem = r.lim.critico - r.mesesActivo;
    if (maisUrgenteR == null || margem < maisUrgenteR.margem) maisUrgenteR = { ...r, margem };
  });
  const rfk5Card = document.getElementById('rfk5-card');
  const rfk5Dot  = document.getElementById('rfk5-dot');
  if (maisUrgenteR) {
    const corClasse = maisUrgenteR.nivel === 'critico' ? 'red' : maisUrgenteR.nivel === 'medio' ? 'amber' : 'green';
    document.getElementById('rfk5').textContent = maisUrgenteR.mesesActivo + ' meses';
    document.getElementById('rfk5-sub').textContent = (maisUrgenteR.eixo ? 'Eixo ' + maisUrgenteR.eixo : '—') + ' · ' + ALERTASR_NIVEL_INFO[maisUrgenteR.nivel].label;
    rfk5Card.className = 'kpi kpi-clickable ' + corClasse;
    rfk5Card.dataset.nivel = maisUrgenteR.nivel;
    rfk5Dot.className = 'live-dot ' + corClasse;
  } else {
    document.getElementById('rfk5').textContent = '—';
    document.getElementById('rfk5-sub').textContent = 'sem estimativa disponível';
    rfk5Card.className = 'kpi';
    delete rfk5Card.dataset.nivel;
    rfk5Dot.className = 'live-dot';
  }

  // 4 cartões finais (+ o de cima) — cada um a responder a uma pergunta
  // real de quem gere a frota (ver README, secção "Cálculos").
  document.getElementById('rfk1').textContent = activos.length;
  document.getElementById('rfk3').textContent = custoAtivos > 0 ? fmtEur(custoAtivos) : '—';
  document.getElementById('rfk4').textContent = custoHistorico > 0 ? fmtEur(custoHistorico) : '—';

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

// Atalho do botão "+ Montar" de um lugar vazio: abre o painel de
// registo por cima do ecrã (sem navegar para Início), já no modo
// Reboque, com a matrícula e a categoria desse lugar preenchidas.
async function montarNoLugarReboque(matricula, lugar) {
  abrirPainelRegistoGeral();
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
