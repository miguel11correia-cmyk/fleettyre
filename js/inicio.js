// ── INÍCIO ────────────────────────────────────────────────────────
//
// Página central, comum a veículos e reboques: resumo do que precisa
// de atenção + formulário único de "Registar pneu" (com um selector
// Camião/Reboque no topo, em vez de duas abas separadas).

let segmentoRegisto = 'veiculo';

async function loadInicio() {
  popularSelectorMatriculaGeral();

  loading(true);
  const [{ data: pneusData }, { data: veiculosData }, { data: reboquesData }] = await Promise.all([
    sb.from('pneus').select('*').eq('empresa_id', currentEmpresaId),
    sb.from('veiculos').select('matricula, km_atual').eq('empresa_id', currentEmpresaId),
    sb.from('reboques').select('*').eq('empresa_id', currentEmpresaId),
  ]);
  loading(false);

  let criticosVeic = [];
  if (pneusData && pneusData.length > 0) {
    const kmAtualPorMat = {};
    (veiculosData || []).forEach(v => { if (v.km_atual != null) kmAtualPorMat[v.matricula] = v.km_atual; });
    criticosVeic = calcularEstimativasDesgaste(pneusData, kmAtualPorMat).filter(r => r.nivel === 'critico');
  }

  let criticosReb = [];
  if (reboquesData && reboquesData.length > 0) {
    criticosReb = calcularAlertasReboques(reboquesData).filter(r => r.nivel === 'critico');
  }

  renderInicioAtencao(criticosVeic, criticosReb);
}

// Cartão "Precisa da tua atenção" — junta camiões e reboques numa só
// visão, já que é o primeiro sítio que se vê ao entrar na app.
function renderInicioAtencao(criticosVeic, criticosReb) {
  const icon = document.getElementById('inicio-atencao-icon');
  const tit  = document.getElementById('inicio-atencao-titulo');
  const sub  = document.getElementById('inicio-atencao-sub');
  const btnV = document.getElementById('inicio-atencao-btn-v');
  const btnR = document.getElementById('inicio-atencao-btn-r');
  if (!icon || !tit || !sub || !btnV || !btnR) return;

  const matsVeic = new Set(criticosVeic.map(r => r.matricula));
  const matsReb  = new Set(criticosReb.map(r => r.matricula));
  const total = matsVeic.size + matsReb.size;

  if (total === 0) {
    icon.textContent = '🟢';
    tit.textContent  = 'Nenhum alerta crítico';
    sub.textContent  = 'Todos os pneus activos estão em bom estado.';
    btnV.classList.add('hidden');
    btnR.classList.add('hidden');
    return;
  }

  icon.textContent = '🔴';
  tit.textContent  = total === 1 ? '1 veículo/reboque com pneus críticos' : total + ' veículos/reboques com pneus críticos';

  const linhas = [];
  if (matsVeic.size > 0) {
    const piorPorMat = {};
    criticosVeic.forEach(r => {
      if (piorPorMat[r.matricula] == null || r.escEstimada < piorPorMat[r.matricula]) piorPorMat[r.matricula] = r.escEstimada;
    });
    const piores = Object.keys(piorPorMat).sort((a, b) => piorPorMat[a] - piorPorMat[b]).slice(0, 3);
    const resto  = matsVeic.size - piores.length;
    linhas.push('Camiões: ' + piores.map(m => `${m} (${piorPorMat[m]}mm)`).join(' · ') + (resto > 0 ? ` · +${resto}` : ''));
  }
  if (matsReb.size > 0) {
    const piorPorMat = {};
    criticosReb.forEach(r => {
      if (piorPorMat[r.matricula] == null || r.mesesActivo > piorPorMat[r.matricula]) piorPorMat[r.matricula] = r.mesesActivo;
    });
    const piores = Object.keys(piorPorMat).sort((a, b) => piorPorMat[b] - piorPorMat[a]).slice(0, 3);
    const resto  = matsReb.size - piores.length;
    linhas.push('Reboques: ' + piores.map(m => `${m} (${piorPorMat[m]} meses)`).join(' · ') + (resto > 0 ? ` · +${resto}` : ''));
  }
  sub.innerHTML = linhas.join('<br>');

  btnV.classList.toggle('hidden', matsVeic.size === 0);
  btnR.classList.toggle('hidden', matsReb.size === 0);
}

function irParaAlertasVeiculosInicio() {
  toggleSecaoSemCarregar('veiculos');
  nav('alertas', document.querySelector('.ni[data-page="alertas"]'));
}

function irParaAlertasReboquesInicio() {
  toggleSecaoSemCarregar('reboques');
  navR('alertas-r', document.querySelector('.ni[data-page="alertas-r"]'));
}

// ── FORMULÁRIO UNIFICADO DE REGISTO ─────────────────────────────────

// Troca entre Camião e Reboque: mostra/esconde os campos que só fazem
// sentido num dos dois (KMs e Posição só em camiões; Eixo só em
// reboques) e repopula a matrícula com a lista certa. `manterMat`
// evita limpar a matrícula quando quem chama já vai preenchê-la a
// seguir (ver montarNoLugar/montarNoLugarReboque).
function toggleSegmentoRegisto(seg, manterMat) {
  segmentoRegisto = seg;
  const isVeic = seg === 'veiculo';
  document.querySelectorAll('.btn-seg').forEach(b => b.classList.toggle('active', b.dataset.seg === seg));
  document.getElementById('g-mat-label').textContent = isVeic ? 'Matrícula do camião *' : 'Matrícula do reboque *';
  document.getElementById('g-kms-row').classList.toggle('hidden', !isVeic);
  document.getElementById('g-pos-row').classList.toggle('hidden', !isVeic);
  document.getElementById('g-eixo-row').classList.toggle('hidden', isVeic);
  if (!manterMat) document.getElementById('g-mat').value = '';
  return popularSelectorMatriculaGeral();
}

function onChangeMatriculaGeral() {
  if (segmentoRegisto === 'veiculo') {
    atualizarCategoriasPosicao('g-mat', 'g-pos', listaVeiculos, SLOTS_VEICULO);
    autoPreencherKms('g-mat', 'g-kms');
  } else {
    atualizarCategoriasPosicao('g-mat', 'g-eixo', listaReboquesFrota, SLOTS_REBOQUE);
  }
}

// Selector de matrícula do formulário único — combina a frota
// (veiculos/reboques_frota) com matrículas que só existem nos registos
// de pneus (sem ficha criada ainda), mantendo o comportamento que já
// existia nos dois formulários separados.
async function popularSelectorMatriculaGeral() {
  const sel = document.getElementById('g-mat');
  if (!sel) return;

  const veic   = segmentoRegisto === 'veiculo';
  const lista  = veic ? listaVeiculos : listaReboquesFrota;
  const tabela = veic ? 'pneus' : 'reboques';

  const { data: extra } = await sb.from(tabela).select('matricula').eq('empresa_id', currentEmpresaId);
  const matsExtra = [...new Set((extra || []).map(r => r.matricula))];

  const mapa = {};
  (lista || []).forEach(v => { mapa[v.matricula] = v; });
  matsExtra.forEach(m => { if (!mapa[m]) mapa[m] = { matricula: m }; });

  const mats = Object.values(mapa).sort((a, b) => a.matricula.localeCompare(b.matricula));

  const val = sel.value;
  sel.innerHTML = '<option value="">— selecionar —</option>' +
    mats.map(v => {
      const label = (v.marca || v.modelo)
        ? `${v.matricula} · ${[v.marca, v.modelo].filter(Boolean).join(' ')}`
        : v.matricula;
      return `<option value="${v.matricula}"${v.matricula === val ? ' selected' : ''}>${label}</option>`;
    }).join('');
}

async function guardarRegistoGeral() {
  const quantidade = parseInt(document.getElementById('g-quantidade')?.value) || 1;
  const mat        = document.getElementById('g-mat').value.trim().toUpperCase();
  const categoria   = segmentoRegisto === 'veiculo'
    ? document.getElementById('g-pos').value
    : document.getElementById('g-eixo').value;

  if (!mat) {
    showFeedback('g-feedback', segmentoRegisto === 'veiculo' ? 'Matrícula do camião é obrigatória.' : 'Matrícula do reboque é obrigatória.', true);
    return;
  }

  const tabela = segmentoRegisto === 'veiculo' ? 'pneus' : 'reboques';
  const slots  = segmentoRegisto === 'veiculo' ? SLOTS_VEICULO : SLOTS_REBOQUE;
  const item   = segmentoRegisto === 'veiculo'
    ? listaVeiculos.find(v => v.matricula === mat)
    : listaReboquesFrota.find(v => v.matricula === mat);

  const resolucao = await resolverLugaresRegisto(tabela, mat, categoria, quantidade, item?.num_eixos, slots);
  if (!resolucao.ok) { showFeedback('g-feedback', resolucao.erro, true); return; }
  const posicoes = resolucao.posicoes;

  // Guardar um registo por lugar calculado (1 ou mais). O stock (fatura
  // ou pneu desmontado) só é descontado UMA vez no fim, pelo nº de
  // registos realmente guardados.
  let sucessos = 0, erros = 0;
  for (let i = 0; i < quantidade; i++) {
    const ok = await _guardarRegistoGeralUnico(posicoes[i]);
    if (ok) sucessos++; else erros++;
  }

  if (sucessos > 0) {
    if (stockLinhaSelId) await descontarStock(stockLinhaSelId, sucessos);
    if (stockDesmontadoSelId) {
      const { id, tabela: tabelaDesmont } = stockDesmontadoSelId;
      await sb.from(tabelaDesmont).update({ remontado: true }).eq('id', id);
    }
  }
  stockLinhaSelId      = null;
  stockDesmontadoSelId = null;

  if (erros === 0) {
    showFeedback('g-feedback', quantidade > 1 ? quantidade + ' registos guardados com sucesso.' : 'Montagem guardada com sucesso.');
    limparFormGeral();
    loadInicio();
  } else {
    showFeedback('g-feedback', sucessos > 0 ? 'Erro em ' + erros + ' de ' + quantidade + ' registos.' : 'Erro ao guardar.', true);
  }
}

async function _guardarRegistoGeralUnico(pos) {
  const mat     = document.getElementById('g-mat').value.trim().toUpperCase();
  const mes     = document.getElementById('g-mes').value.trim();
  const marca   = document.getElementById('g-marca').value.trim().toUpperCase();
  const medida  = document.getElementById('g-medida').value.trim();
  const subtipo = document.getElementById('g-subtipo').value;
  const tipo    = document.getElementById('g-tipo').value;
  const forn    = document.getElementById('g-forn').value.trim().toUpperCase();
  const matPneu = document.getElementById('g-matpneu').value.trim().toUpperCase();
  const custoP  = parseFloat(document.getElementById('g-custo').value) || null;
  const custoMO = parseFloat(document.getElementById('g-mo').value)    || null;

  if (!mat) { showFeedback('g-feedback', segmentoRegisto === 'veiculo' ? 'Matrícula do camião é obrigatória.' : 'Matrícula do reboque é obrigatória.', true); return false; }
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) { showFeedback('g-feedback', 'Mês inválido. Use o formato AAAA-MM.', true); return false; }

  const registo = {
    empresa_id:  currentEmpresaId,
    matricula:   mat,
    mes_mont:    mes,
    posicao:     pos || null,
    marca:       marca || null,
    medida:      medida || null,
    subtipo:     subtipo || null,
    tipo:        tipo || null,
    fornecedor:  forn || null,
    mat_pneu:    matPneu || null,
    custo_pneu:  custoP,
    custo_mo:    custoMO,
    custo_total: (custoP || 0) + (custoMO || 0) || null,
    mes_desmont:     null,
    escultura_final: null,
    destino:         null,
  };

  const tabela = segmentoRegisto === 'veiculo' ? 'pneus' : 'reboques';

  if (segmentoRegisto === 'veiculo') {
    const kms = parseInt(document.getElementById('g-kms').value);
    if (!kms || kms <= 0) { showFeedback('g-feedback', 'KMs do conta-quilómetros é obrigatório.', true); return false; }
    registo.kms_mont    = kms;
    registo.kms_desmont = null;
  } else {
    registo.eixo = eixoDoLugar(pos);
  }

  loading(true);
  const { error } = await sb.from(tabela).insert([registo]);
  loading(false);

  if (error) { showFeedback('g-feedback', 'Erro ao guardar: ' + error.message, true); return false; }
  return true;
}

function limparFormGeral() {
  ['g-mat', 'g-mes', 'g-pos', 'g-eixo', 'g-kms', 'g-marca', 'g-medida', 'g-subtipo', 'g-forn', 'g-matpneu', 'g-custo', 'g-mo']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('g-tipo').value = 'Novo';
  document.getElementById('g-quantidade').value = 1;
  stockLinhaSelId      = null;
  stockDesmontadoSelId = null;
  const info = document.getElementById('g-stock-info');
  if (info) info.classList.add('hidden');
}
