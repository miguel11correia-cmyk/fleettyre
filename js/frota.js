// ── FROTA ──────────────────────────────────────────────

const ICON_VEICULO = '<svg viewBox="0 0 512.001 512.001" width="14" height="14" fill="currentColor" style="vertical-align:-2px;margin-right:4px"><use href="#icon-truck"/></svg>';

let frotaHistoricoExpandido = false;

// ── SELEÇÃO MÚLTIPLA ──────────────────────────────────────────────
// Pneus de Direção/Tração (ou do mesmo eixo) saem quase sempre ao
// mesmo tempo — em vez de desmontar/editar um a um, seleciona-se
// vários registos activos e aplica-se a mesma desmontagem/edição a
// todos de uma vez (ver abrirPainelBulk / abrirEdicaoBulkFrota).
let frotaSelecionados = new Set();

function toggleFrotaSel(id) {
  if (frotaSelecionados.has(id)) frotaSelecionados.delete(id);
  else frotaSelecionados.add(id);
  renderFrotaBulkBar();
}

function limparSelecaoFrota() {
  frotaSelecionados = new Set();
  document.querySelectorAll('.frota-sel-chk').forEach(c => { c.checked = false; });
  renderFrotaBulkBar();
}

function renderFrotaBulkBar() {
  const bar = document.getElementById('frota-bulk-bar');
  if (!bar) return;
  const n = frotaSelecionados.size;
  bar.classList.toggle('hidden', n === 0);
  const count = document.getElementById('frota-bulk-count');
  if (count) count.textContent = n + (n === 1 ? ' selecionado' : ' selecionados');
}

function abrirEdicaoBulkFrota() {
  if (frotaSelecionados.size === 0) return;
  abrirEdicaoBulk([...frotaSelecionados], 'pneus');
}

function toggleFrotaHistorico() {
  frotaHistoricoExpandido = !frotaHistoricoExpandido;
  document.getElementById('frota-historico-wrap').classList.toggle('hidden', !frotaHistoricoExpandido);
  document.getElementById('frota-historico-seta').textContent = frotaHistoricoExpandido ? '▾ Recolher' : '▸ Expandir';
}

async function initFrotaSelect() {
  loading(true);
  const { data, error } = await fetchAllRows(() => sb
    .from('pneus')
    .select('matricula')
    .eq('empresa_id', currentEmpresaId)
    .order('matricula'));
  loading(false);

  if (error || !data) return;

  const mats = [...new Set(data.map(r => r.matricula))].sort();
  const sel  = document.getElementById('sel-mat');
  const prev = sel.value;
  sel.innerHTML = mats.map(m => `<option value="${m}"${m === prev ? ' selected' : ''}>${m}</option>`).join('');

  if (mats.length > 0) await loadFrota();
}

async function loadFrota() {
  const mat = document.getElementById('sel-mat').value;
  if (!mat) return;

  loading(true);
  const [{ data, error }, { data: veiculo }] = await Promise.all([
    sb.from('pneus').select('*').eq('matricula', mat).eq('empresa_id', currentEmpresaId).order('mes_mont', { ascending: true }),
    sb.from('veiculos').select('*').eq('matricula', mat).eq('empresa_id', currentEmpresaId).maybeSingle()
  ]);
  loading(false);

  limparSelecaoFrota();
  renderInfoVeiculo(veiculo, mat);

  if (error || !data) return;

  // ── KPIs da matrícula ──
  const activosArr0 = data.filter(r => !r.mes_desmont);
  const activos  = activosArr0.length;
  const kmAtual  = veiculo?.km_atual ?? null;

  // KMs médios dos pneus ATIVOS — usa kmsReaisOuEstimados (js/alertas.js),
  // que já tinha a cascata real→estimativa desde antes de haver
  // telemetria, para nunca ficar sem valor mesmo sem Cartrack ligado.
  // Exige mes_mont/kms_mont preenchidos, tal como o uso original em
  // Alertas — sem isso a estimativa cairia sempre no fallback de 0.
  const kmsAtivosArr = activosArr0.filter(r => r.mes_mont && r.kms_mont).map(r => kmsReaisOuEstimados(r, data, kmAtual));
  const kmsmedios = kmsAtivosArr.length > 0
    ? Math.round(kmsAtivosArr.reduce((s, v) => s + v, 0) / kmsAtivosArr.length)
    : null;

  const comCusto        = data.filter(r => r.custo_pneu != null && r.custo_pneu > 0);
  const custoHistorico  = comCusto.reduce((s, r) => s + Number(r.custo_pneu), 0);
  // Só os pneus activos (montados agora) — o histórico completo faria o
  // valor crescer sempre, mesmo sem o custo real por km ter mudado.
  const custoAtivos     = comCusto.filter(r => !r.mes_desmont).reduce((s, r) => s + Number(r.custo_pneu), 0);

  // €/km = custo dos pneus activos ÷ KMs médios por pneu
  const eurKm = (custoAtivos > 0 && kmsmedios && kmsmedios > 0)
    ? (custoAtivos / kmsmedios).toFixed(4)
    : null;

  // 5 cartões finais — cada um a responder a uma pergunta real de quem
  // gere a frota (ver README, secção "Cálculos").
  document.getElementById('fk1').textContent = activos;
  document.getElementById('fk2').textContent = eurKm ? '€ ' + eurKm : '—';
  document.getElementById('fk3').textContent = custoAtivos > 0 ? fmtEur(custoAtivos) : '—';
  document.getElementById('fk4').textContent = custoHistorico > 0 ? fmtEur(custoHistorico) : '—';
  document.getElementById('fk5').textContent = kmsmedios ? fmt(kmsmedios) : '—';

  // ── Tabelas: lugares fixos (se a configuração for conhecida) + histórico ──
  const slots        = SLOTS_VEICULO[veiculo?.num_eixos];
  const activosArr    = data.filter(r => !r.mes_desmont);
  const historicoArr  = data.filter(r => r.mes_desmont);
  const lugaresCard   = document.getElementById('frota-lugares-card');
  const historicoCt   = document.getElementById('frota-historico-label');

  if (slots) {
    lugaresCard.classList.remove('hidden');
    historicoCt.textContent = 'Histórico de pneus';

    const porLugar = {};
    activosArr.forEach(r => { porLugar[r.posicao] = r; });
    const semLugar = activosArr.filter(r => !slots.includes(r.posicao));

    document.getElementById('frota-lugares-tbody').innerHTML =
      slots.map(lugar => linhaLugar(lugar, porLugar[lugar], mat, kmAtual)).join('') +
      semLugar.map(r => linhaLugar(r.posicao || '(sem posição)', r, mat, kmAtual, true)).join('');

    document.getElementById('frota-tbody').innerHTML = historicoArr.map(r => linhaHistorico(r, kmAtual)).join('');
  } else {
    lugaresCard.classList.add('hidden');
    historicoCt.textContent = 'Histórico de pneus: clique em "Desmontar" para registar saída';
    document.getElementById('frota-tbody').innerHTML = data.map(r => linhaHistorico(r, kmAtual)).join('');
  }
}

// Uma linha da tabela "Lugares" — preenchida com o pneu activo desse
// lugar, ou vazia com um botão para montar. `aviso=true` assinala um
// pneu activo cujo lugar não corresponde à configuração actual do
// veículo (raro — só acontece com dados que o backfill não conseguiu
// mapear automaticamente).
function linhaLugar(lugar, r, mat, kmAtual, aviso) {
  if (!r) {
    return `<tr style="color:var(--text3)">
      <td></td>
      <td>${lugar}</td>
      <td colspan="11">— vazio —</td>
      <td><button class="btn btn-sm" onclick="montarNoLugar('${mat}','${lugar}')"><svg viewBox="0 0 24 24"><use href="#icon-plus"/></svg> Montar</button></td>
    </tr>`;
  }
  const kmsEfInfo = kmsEfectuados(r, kmAtual);
  const kmsEf = kmsEfInfo
    ? (kmsEfInfo.estimado ? '<span style="color:var(--text3)" title="Estimado a partir do km atual">~' + fmt(kmsEfInfo.km) + '</span>' : fmt(kmsEfInfo.km))
    : '—';
  const esc    = r.rasto_final != null ? r.rasto_final + ' mm' : '—';
  const escCls = (r.rasto_final != null && r.rasto_final <= 3) ? 'badge b-alert' : '';
  const avisoIcon = aviso ? ` <span title="Posição não reconhecida na configuração actual do veículo — edite o registo para corrigir" style="color:var(--red)">⚠</span>` : '';
  const acBtn = `<div style="display:flex;gap:4px;flex-wrap:nowrap">
      <button class="btn btn-s btn-s-brand" onclick="abrirPainel(${r.id})"><svg viewBox="0 0 24 24"><use href="#icon-wrench"/></svg> Desmontar</button>
      <button class="btn btn-sm btn-icon" onclick="abrirEdicao(${r.id})" title="Editar"><svg viewBox="0 0 24 24"><use href="#icon-edit"/></svg></button>
      ${pdfAnexoBtnHtml('pneus', r.id, r.pdf_path, 'loadFrota')}
      <button class="btn btn-sm btn-icon btn-danger" onclick="apagarRegisto(${r.id},'${r.matricula}')" title="Apagar"><svg viewBox="0 0 24 24"><use href="#icon-trash"/></svg></button>
    </div>`;
  return `<tr>
    <td><input type="checkbox" class="frota-sel-chk" ${frotaSelecionados.has(r.id) ? 'checked' : ''} onchange="toggleFrotaSel(${r.id})"></td>
    <td>${lugar}${avisoIcon}</td>
    <td>${r.marca || '—'}</td>
    <td>${r.subtipo || '—'}</td>
    <td>${r.medida || '—'}</td>
    <td>${r.fornecedor || '—'}</td>
    <td>${tipoBadge(r.tipo)}</td>
    <td style="text-align:right">${fmt(r.kms_mont)}</td>
    <td>${r.mes_mont || '—'}</td>
    <td style="text-align:right">${kmsEf}</td>
    <td><span class="${escCls}">${esc}</span></td>
    <td style="text-align:right">${r.custo_pneu != null ? fmtEur(r.custo_pneu) : '—'}</td>
    <td style="text-align:right">${r.custo_mo != null ? fmtEur(r.custo_mo) : '—'}</td>
    <td>${acBtn}</td>
  </tr>`;
}

// Uma linha da tabela "Histórico" (ou da tabela única, para veículos
// sem configuração conhecida — mesmo comportamento de sempre).
function linhaHistorico(r, kmAtual) {
  const kmsEfInfo = kmsEfectuados(r, kmAtual);
  const kmsEf = kmsEfInfo
    ? (kmsEfInfo.estimado ? '<span style="color:var(--text3)" title="Estimado a partir do km atual">~' + fmt(kmsEfInfo.km) + '</span>' : fmt(kmsEfInfo.km))
    : '—';
  const esc   = r.rasto_final != null ? r.rasto_final + ' mm' : '—';
  const escCls= (r.rasto_final != null && r.rasto_final <= 3) ? 'badge b-alert' : '';
  const custoTot = (r.custo_pneu || 0) + (r.custo_mo || 0);
  const acBtn = `<div style="display:flex;gap:4px;flex-wrap:nowrap">
      ${!r.mes_desmont ? `<button class="btn btn-s btn-s-brand" onclick="abrirPainel(${r.id})"><svg viewBox="0 0 24 24"><use href="#icon-wrench"/></svg> Desmontar</button>` : '<span style="color:var(--text3)" title="Desmontado"><svg viewBox="0 0 24 24" style="width:14px;height:14px"><use href="#icon-check"/></svg></span>'}
      <button class="btn btn-sm btn-icon" onclick="abrirEdicao(${r.id})" title="Editar"><svg viewBox="0 0 24 24"><use href="#icon-edit"/></svg></button>
      ${pdfAnexoBtnHtml('pneus', r.id, r.pdf_path, 'loadFrota')}
      <button class="btn btn-sm btn-icon btn-danger" onclick="apagarRegisto(${r.id},'${r.matricula}')" title="Apagar"><svg viewBox="0 0 24 24"><use href="#icon-trash"/></svg></button>
    </div>`;
  return `<tr>
    <td>${!r.mes_desmont ? `<input type="checkbox" class="frota-sel-chk" ${frotaSelecionados.has(r.id) ? 'checked' : ''} onchange="toggleFrotaSel(${r.id})">` : ''}</td>
    <td>${r.mes_mont || '—'}</td>
    <td>${r.posicao  || '—'}</td>
    <td>${r.marca    || '—'}</td>
    <td>${r.subtipo  || '—'}</td>
    <td>${r.medida   || '—'}</td>
    <td>${r.fornecedor || '—'}</td>
    <td>${tipoBadge(r.tipo)}</td>
    <td style="text-align:right">${fmt(r.kms_mont)}</td>
    <td>${r.mes_desmont || '—'}</td>
    <td style="text-align:right">${r.kms_desmont ? fmt(r.kms_desmont) : '—'}</td>
    <td style="text-align:right">${kmsEf}</td>
    <td><span class="${escCls}">${esc}</span></td>
    <td>${r.destino  || '—'}</td>
    <td style="text-align:right">${r.custo_pneu != null ? fmtEur(r.custo_pneu) : '—'}</td>
    <td style="text-align:right">${r.custo_mo   != null ? fmtEur(r.custo_mo)   : '—'}</td>
    <td style="text-align:right">${custoTot > 0 ? fmtEur(custoTot) : '—'}</td>
    <td>${acBtn}</td>
  </tr>`;
}

// Atalho do botão "+ Montar" de um lugar vazio: abre o painel de
// registo por cima do ecrã (sem navegar para Início), já no modo
// Camião, com a matrícula e a categoria desse lugar preenchidas.
async function montarNoLugar(matricula, lugar) {
  abrirPainelRegistoGeral();
  await toggleSegmentoRegisto('veiculo', true);
  document.getElementById('g-mat').value = matricula;
  atualizarCategoriasPosicao('g-mat', 'g-pos', listaVeiculos, SLOTS_VEICULO);
  document.getElementById('g-pos').value = categoriaPosicao(lugar);
  document.getElementById('g-mes').focus();
}

function renderInfoVeiculo(v, mat) {
  const el = document.getElementById('frota-info-veiculo');
  if (!el) return;

  if (!v) {
    el.innerHTML = `<div class="ct">${ICON_VEICULO}${mat}</div>
      <p style="font-size:12px;color:var(--text3)">Sem ficha de veículo registada em "Frota".</p>`;
    return;
  }

  el.innerHTML = `
    <div class="ct">${ICON_VEICULO}${v.matricula}</div>
    <div class="g3" style="margin-bottom:0">
      <div><span style="font-size:11px;color:var(--text3)">Marca</span><br>${renderMarcaComLogo(v.marca)}</div>
      <div><span style="font-size:11px;color:var(--text3)">Modelo</span><br>${v.modelo || '—'}</div>
      <div><span style="font-size:11px;color:var(--text3)">Ano</span><br>${v.ano || '—'}</div>
    </div>
    <div class="g3" style="margin-bottom:0">
      <div><span style="font-size:11px;color:var(--text3)">Tipo</span><br>${v.tipo || '—'}</div>
      <div><span style="font-size:11px;color:var(--text3)">Configuração eixos</span><br>${v.num_eixos || '—'}</div>
      <div><span style="font-size:11px;color:var(--text3)">Reboque habitual</span><br>${v.reboque_hab || '—'}</div>
    </div>
    ${v.km_atual != null ? `<div style="margin-top:8px;padding-top:8px;border-top:0.5px solid var(--border);font-size:11px;color:var(--text2)">
      KM atual: <strong>${fmt(v.km_atual)}</strong> km${v.km_atual_em ? ' · atualizado ' + relativo(v.km_atual_em) : ''}
    </div>` : ''}`;
}

function relativo(isoDate) {
  const diffMin = Math.round((Date.now() - new Date(isoDate).getTime()) / 60000);
  if (diffMin < 60)   return `há ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24)     return `há ${diffH}h`;
  const diffD = Math.round(diffH / 24);
  return `há ${diffD} dia${diffD === 1 ? '' : 's'}`;
}

let painelIdsBulk = null;

async function abrirPainel(id) {
  // Buscar registo para mostrar info
  const { data } = await sb.from('pneus').select('*').eq('id', id).eq('empresa_id', currentEmpresaId).single();
  if (!data) return;
  painelId = id;
  painelIdsBulk = null;

  document.getElementById('painel-info').innerHTML =
    `<strong>${data.matricula}</strong> · ${data.posicao || '—'} · ${data.marca || '—'} ${data.medida || ''}<br>
     <span style="color:var(--text2)">Montagem: ${data.mes_mont} · KMs montagem: ${fmt(data.kms_mont)}</span>`;

  // Limpar campos
  ['d-mes','d-kms','d-mo'].forEach(id => { document.getElementById(id).value = ''; });
  // Predefinido a 2.5mm — ponto típico de substituição por segurança/
  // integridade da carcaça (bem acima do mínimo legal de 1.6mm), para
  // não ficar em branco por omissão. O utilizador substitui se souber
  // o valor real medido.
  document.getElementById('d-esc').value = '2.5';
  document.getElementById('d-dest').value = 'Remix';
  document.getElementById('d-feedback').classList.add('hidden');

  // Sugerir o KM atual do veículo (se for maior que o KM de montagem — não faz sentido sugerir um valor mais baixo)
  const veiculo = (listaVeiculos || []).find(v => v.matricula === data.matricula);
  if (veiculo && veiculo.km_atual != null && veiculo.km_atual > data.kms_mont) {
    setKmsInputValue('d-kms', veiculo.km_atual);
  }

  document.getElementById('painel').classList.add('open');
}

// Desmontagem de vários pneus de uma vez (ex: toda a Direção ou todo
// um eixo) — mesmo painel do botão "Desmontar" individual, mas com
// mês/KMs/rasto/destino/mão de obra aplicados a todos os selecionados.
async function abrirPainelBulk(ids) {
  if (!ids || ids.length === 0) return;
  const { data } = await sb.from('pneus').select('id,matricula,posicao,marca,medida,kms_mont').in('id', ids).eq('empresa_id', currentEmpresaId);
  const registos = data || [];
  if (registos.length === 0) return;
  painelId = null;
  painelIdsBulk = ids;

  const linhas = registos.map(r => `${r.posicao || '—'} · ${r.marca || '—'} ${r.medida || ''}`).join('<br>');
  document.getElementById('painel-info').innerHTML =
    `<strong>${registos[0].matricula}</strong> · <strong>${registos.length} pneus selecionados</strong><br>
     <span style="color:var(--text2)">${linhas}</span>`;

  ['d-mes','d-kms','d-mo'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('d-esc').value = '2.5';
  document.getElementById('d-dest').value = 'Remix';
  document.getElementById('d-feedback').classList.add('hidden');
  document.getElementById('painel').classList.add('open');
}

function fecharPainel() {
  document.getElementById('painel').classList.remove('open');
  painelId = null;
  painelIdsBulk = null;
}

async function guardarDesmontagem() {
  if (painelIdsBulk) return guardarDesmontagemBulk();
  if (painelId == null) return;

  const mes    = document.getElementById('d-mes').value.trim();
  const escStr = document.getElementById('d-esc').value;
  const dest   = document.getElementById('d-dest').value;
  const moStr  = document.getElementById('d-mo').value;

  // Validações
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    showFeedback('d-feedback', 'Mês inválido. Use o formato AAAA-MM.', true); return;
  }
  const kms = kmsInputValue('d-kms');
  if (!kms || kms <= 0) {
    showFeedback('d-feedback', 'KMs são obrigatórios.', true); return;
  }

  // Buscar registo original para validar KMs
  const { data: orig } = await sb.from('pneus').select('kms_mont, tipo, custo_pneu').eq('id', painelId).eq('empresa_id', currentEmpresaId).single();
  if (orig && orig.kms_mont && kms <= orig.kms_mont) {
    showFeedback('d-feedback', `KMs de desmontagem (${fmt(kms)}) têm de ser maiores que os de montagem (${fmt(orig.kms_mont)}).`, true);
    return;
  }

  const esc  = escStr !== '' ? parseFloat(escStr) : null;
  const mo   = moStr  !== '' ? parseFloat(moStr)  : null;

  // Custo total = custo pneu (já existente) + mão obra desmontagem

  // Buscar custo_pneu original para calcular custo_total
  const { data: orig2 } = await sb.from('pneus').select('custo_pneu').eq('id', painelId).eq('empresa_id', currentEmpresaId).single();
  const custoTotalDesm = ((orig2?.custo_pneu || 0) + (mo || 0)) || null;

  const updates = {
    mes_desmont:     mes,
    kms_desmont:     kms,
    rasto_final: (esc != null && esc >= 0 && esc <= 20) ? esc : null,
    destino:         dest,
    custo_mo:        mo,
    custo_total:     custoTotalDesm,
  };

  loading(true);
  const { error } = await sb.from('pneus').update(updates).eq('id', painelId);
  loading(false);

  if (error) {
    showFeedback('d-feedback', 'Erro: ' + error.message, true); return;
  }
  showFeedback('d-feedback', 'Desmontagem guardada.');
  setTimeout(() => {
    fecharPainel();
    loadFrota();
  }, 800);
}

async function guardarDesmontagemBulk() {
  const ids = painelIdsBulk;
  if (!ids || ids.length === 0) return;

  const mes    = document.getElementById('d-mes').value.trim();
  const escStr = document.getElementById('d-esc').value;
  const dest   = document.getElementById('d-dest').value;
  const moStr  = document.getElementById('d-mo').value;

  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    showFeedback('d-feedback', 'Mês inválido. Use o formato AAAA-MM.', true); return;
  }
  const kms = kmsInputValue('d-kms');
  if (!kms || kms <= 0) {
    showFeedback('d-feedback', 'KMs são obrigatórios.', true); return;
  }

  const { data: origs } = await sb.from('pneus').select('id,kms_mont,custo_pneu').in('id', ids).eq('empresa_id', currentEmpresaId);
  const mapa = {};
  (origs || []).forEach(r => { mapa[r.id] = r; });

  const invalido = ids.find(id => mapa[id] && mapa[id].kms_mont && kms <= mapa[id].kms_mont);
  if (invalido) {
    showFeedback('d-feedback', `KMs de desmontagem (${fmt(kms)}) têm de ser maiores que os de montagem de todos os pneus selecionados.`, true);
    return;
  }

  const esc = escStr !== '' ? parseFloat(escStr) : null;
  const mo  = moStr  !== '' ? parseFloat(moStr)  : null;

  loading(true);
  let erros = 0;
  for (const id of ids) {
    const custoTotalDesm = ((mapa[id]?.custo_pneu || 0) + (mo || 0)) || null;
    const { error } = await sb.from('pneus').update({
      mes_desmont: mes,
      kms_desmont: kms,
      rasto_final: (esc != null && esc >= 0 && esc <= 20) ? esc : null,
      destino:     dest,
      custo_mo:    mo,
      custo_total: custoTotalDesm,
    }).eq('id', id);
    if (error) erros++;
  }
  loading(false);

  if (erros === 0) {
    showFeedback('d-feedback', ids.length + ' desmontagens guardadas.');
    setTimeout(() => { fecharPainel(); loadFrota(); }, 800);
  } else {
    showFeedback('d-feedback', 'Erro em ' + erros + ' de ' + ids.length + ' registos.', true);
  }
}

async function abrirEdicao(id) {
  loading(true);
  const { data, error } = await sb.from('pneus').select('*').eq('id', id).eq('empresa_id', currentEmpresaId).single();
  loading(false);
  if (error || !data) return;

  editId = id;

  // Preencher painel de edição
  document.getElementById('e-mat').value     = data.matricula    || '';
  document.getElementById('e-mes').value     = data.mes_mont     || '';
  setKmsInputValue('e-kms', data.kms_mont);
  const veiculoEd = listaVeiculos.find(v => v.matricula === data.matricula);
  await atualizarLugaresEdicao('e-pos', 'pneus', data.matricula, data.posicao, veiculoEd?.num_eixos, SLOTS_VEICULO, data.id);
  document.getElementById('e-marca').value   = data.marca        || '';
  document.getElementById('e-medida').value  = data.medida       || '';
  popularSelectorSubtipo('e-marca', 'e-subtipo');
  document.getElementById('e-subtipo').value = data.subtipo      || '';
  document.getElementById('e-tipo').value    = data.tipo         || 'Novo';
  document.getElementById('e-forn').value    = data.fornecedor   || '';
  document.getElementById('e-custo').value   = data.custo_pneu   != null ? data.custo_pneu : '';
  document.getElementById('e-mo').value      = data.custo_mo     != null ? data.custo_mo   : '';

  document.getElementById('e-feedback').classList.add('hidden');
  document.getElementById('painel-editar').classList.add('open');
}

function fecharEdicao() {
  document.getElementById('painel-editar').classList.remove('open');
  editId = null;
}

async function guardarEdicao() {
  if (editId == null) return;

  const mat    = document.getElementById('e-mat').value.trim().toUpperCase();
  const mes    = document.getElementById('e-mes').value.trim();
  const kms    = kmsInputValue('e-kms') || null;
  const pos    = document.getElementById('e-pos').value;
  const marca  = document.getElementById('e-marca').value.trim().toUpperCase();
  const medida = document.getElementById('e-medida').value.trim();
  const subtipo= document.getElementById('e-subtipo').value.trim();
  const tipo   = document.getElementById('e-tipo').value;
  const forn   = document.getElementById('e-forn').value.trim().toUpperCase();
  const custoP = document.getElementById('e-custo').value !== '' ? parseFloat(document.getElementById('e-custo').value) : null;
  const custoMO= document.getElementById('e-mo').value    !== '' ? parseFloat(document.getElementById('e-mo').value)    : null;

  // Validações básicas
  if (!mat) { showFeedback('e-feedback', 'Matrícula é obrigatória.', true); return; }
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) { showFeedback('e-feedback', 'Mês de montagem inválido. Use o formato AAAA-MM.', true); return; }
  if (!kms || kms <= 0) { showFeedback('e-feedback', 'KMs de montagem são obrigatórios.', true); return; }

  // Desmontagem (mês/kms/rasto/destino) não se edita aqui — para isso
  // existe o botão "Desmontar", por isso esses campos nem entram no
  // update e mantêm o valor que já tinham.
  const updates = {
    matricula:       mat,
    mes_mont:        mes,
    kms_mont:        kms,
    posicao:         pos    || null,
    marca:           marca  || null,
    medida:          medida || null,
    subtipo:         subtipo|| null,
    tipo:            tipo   || null,
    fornecedor:      forn   || null,
    custo_pneu:      custoP,
    custo_mo:        custoMO,
    custo_total:     ((custoP || 0) + (custoMO || 0)) || null,
  };

  loading(true);
  const { error } = await sb.from('pneus').update(updates).eq('id', editId);
  loading(false);

  if (error) { showFeedback('e-feedback', 'Erro: ' + error.message, true); return; }

  showFeedback('e-feedback', 'Registo atualizado.');
  setTimeout(() => { fecharEdicao(); loadFrota(); }, 800);
}


async function apagarRegisto(id, matricula) {
  if (!confirm(`Tem a certeza que quer apagar este registo de ${matricula}? Esta ação não pode ser desfeita.`)) return;
  loading(true);
  const { error } = await sb.from('pneus').delete().eq('id', id);
  loading(false);
  if (error) { alert('Erro ao apagar: ' + error.message); return; }
  loadFrota();
}
