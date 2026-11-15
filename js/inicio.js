// ── INÍCIO ────────────────────────────────────────────────────────
// Página central, comum a veículos e reboques: aviso de atenção +
// resumo geral (KPIs e gráficos, antes espalhados por "Dashboard
// Frota" e "Dashboard Reboques", agora fundidos aqui com um selector
// Camiões/Reboques/Visão unificada) + atalho para o registo de pneu
// (formulário movido para um painel lateral, para não ocupar sempre
// o ecrã principal).

let segmentoRegisto = 'veiculo';
let inicioVista = 'unificada'; // 'veiculos' | 'reboques' | 'unificada'
let inicioDadosVeic = { pneus: [], veiculos: [] };
let inicioDadosReb  = { reboques: [] };
let inicioAlertasCount = { veic: 0, reb: 0 };

async function loadInicio() {
  popularSelectorMatriculaGeral();

  loading(true);
  const [{ data: pneusData }, { data: veiculosData }, { data: reboquesData }] = await Promise.all([
    fetchAllRows(() => sb.from('pneus').select('*').eq('empresa_id', currentEmpresaId).order('mes_mont', { ascending: true })),
    sb.from('veiculos').select('matricula, km_atual').eq('empresa_id', currentEmpresaId),
    fetchAllRows(() => sb.from('reboques').select('*').eq('empresa_id', currentEmpresaId).order('mes_mont', { ascending: true })),
  ]);
  loading(false);

  inicioDadosVeic = { pneus: pneusData || [], veiculos: veiculosData || [] };
  inicioDadosReb  = { reboques: reboquesData || [] };

  let criticosVeic = [];
  if (inicioDadosVeic.pneus.length > 0) {
    const kmAtualPorMat = {};
    inicioDadosVeic.veiculos.forEach(v => { if (v.km_atual != null) kmAtualPorMat[v.matricula] = v.km_atual; });
    criticosVeic = calcularEstimativasDesgaste(inicioDadosVeic.pneus, kmAtualPorMat).filter(r => r.nivel === 'critico');
  }

  let criticosReb = [];
  if (inicioDadosReb.reboques.length > 0) {
    criticosReb = calcularAlertasReboques(inicioDadosReb.reboques).filter(r => r.nivel === 'critico');
  }

  inicioAlertasCount = {
    veic: new Set(criticosVeic.map(r => r.matricula)).size,
    reb:  new Set(criticosReb.map(r => r.matricula)).size,
  };

  // Badges do menu — antes actualizados dentro de loadDashboard()/
  // loadDashboardReboques(), agora aqui, já que o Início carrega
  // sempre a seguir ao login (ver navInicio() em auth.js).
  const badgeV = document.getElementById('badge-alertas');
  if (badgeV) {
    badgeV.textContent = inicioAlertasCount.veic;
    badgeV.classList.toggle('hidden', inicioAlertasCount.veic === 0);
  }
  const badgeR = document.getElementById('badge-alertas-r');
  if (badgeR) {
    badgeR.textContent = inicioAlertasCount.reb;
    badgeR.classList.toggle('hidden', inicioAlertasCount.reb === 0);
  }

  renderInicioAtencao(criticosVeic, criticosReb);
  renderInicioVista();
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

// ── VISÃO GERAL (ex-"Dashboard Frota" / "Dashboard Reboques") ──────
// Os dois dashboards separados fundiram-se aqui: os KPIs e os
// gráficos comuns (tipo/fornecedor/marca/evolução mensal/tabela
// anual) recalculam-se consoante a vista escolhida, juntando dados
// de camiões e reboques quando a vista é "unificada" já que os
// campos (tipo, marca, fornecedor, custo_pneu, mes_mont) são os
// mesmos nas duas tabelas. A análise por posição (camiões) e por
// eixo (reboques) não são combináveis — por isso só aparecem nas
// vistas individuais.

function escolherVistaInicio(v) {
  inicioVista = v;
  renderInicioVista();
}

function renderInicioVista() {
  const pneus     = inicioDadosVeic.pneus || [];
  const reboques  = inicioDadosReb.reboques || [];

  let total, matsLabel, matsSub, alertsSub, alertasN;
  if (inicioVista === 'veiculos') {
    total = pneus;
    matsLabel = 'Matrículas'; matsSub = 'veículos na frota'; alertsSub = 'rasto ≤ 3mm';
    alertasN = inicioAlertasCount.veic;
  } else if (inicioVista === 'reboques') {
    total = reboques;
    matsLabel = 'Reboques'; matsSub = 'matrículas'; alertsSub = 'acima do limite';
    alertasN = inicioAlertasCount.reb;
  } else {
    total = [...pneus, ...reboques];
    matsLabel = 'Matrículas'; matsSub = 'veículos + reboques'; alertsSub = 'críticos';
    alertasN = inicioAlertasCount.veic + inicioAlertasCount.reb;
  }
  const ativos = total.filter(r => !r.mes_desmont);

  document.getElementById('k-activos').textContent   = ativos.length;
  document.getElementById('k-total').textContent     = total.length;
  document.getElementById('k-mats-label').textContent = matsLabel;
  document.getElementById('k-mats').textContent      = new Set(total.map(r => r.matricula)).size;
  document.getElementById('k-mats-sub').textContent  = matsSub;
  document.getElementById('k-alerts').textContent    = alertasN;
  document.getElementById('k-alerts-sub').textContent = alertsSub;

  const comCusto   = total.filter(r => r.custo_pneu != null && r.custo_pneu > 0);
  const custoTotal = comCusto.reduce((s, r) => s + Number(r.custo_pneu), 0);
  const custoMed   = comCusto.length > 0 ? custoTotal / comCusto.length : null;
  document.getElementById('k-custo').textContent = custoTotal > 0 ? fmtEur(custoTotal) : '—';
  document.getElementById('k-med').textContent   = custoMed   ? fmtEur(custoMed)   : '—';

  // ── Gráficos por tipo/fornecedor/marca (só pneus ativos) ──
  const tipos   = countBy(ativos, 'tipo');
  const tLabels = Object.keys(tipos).sort((a, b) => tipos[b] - tipos[a]);
  mkChart('c-tipo', 'bar', tLabels, tLabels.map(k => tipos[k]), CHART_NEUTRAL, { topLabels: true });

  const forns = countBy(ativos, 'fornecedor');
  const fKeys = Object.keys(forns).sort((a, b) => forns[b] - forns[a]);
  mkChart('c-forn', 'bar', fKeys, fKeys.map(k => forns[k]), CHART_NEUTRAL, { topLabels: true });

  const marcs = countBy(ativos, 'marca');
  const mKeys = Object.keys(marcs).sort((a, b) => marcs[b] - marcs[a]);
  mkChart('c-marc', 'bar', mKeys, mKeys.map(k => marcs[k]), CHART_NEUTRAL, { topLabels: true });

  // ── Evolução mensal do custo (linha) ──
  const porMes = {};
  total.forEach(r => {
    if (!r.mes_mont || !r.custo_pneu || r.custo_pneu <= 0) return;
    porMes[r.mes_mont] = (porMes[r.mes_mont] || 0) + Number(r.custo_pneu);
  });
  const meses = Object.keys(porMes).sort();
  if (meses.length > 0) {
    mkChart('c-mensal', 'line', meses, meses.map(m => porMes[m]), [CHART_NEUTRAL], {
      elements: {
        line: { borderColor: CHART_NEUTRAL, borderWidth: 2, tension: 0.3, fill: false },
        point: { backgroundColor: CHART_NEUTRAL, radius: 3 }
      }
    });
  }

  // ── Tabela anual ──
  const porAno = {};
  total.forEach(r => {
    if (!r.mes_mont) return;
    const ano = r.mes_mont.split('-')[0];
    if (!porAno[ano]) porAno[ano] = { pneus: 0, custo: 0, comCusto: 0 };
    porAno[ano].pneus++;
    if (r.custo_pneu > 0) { porAno[ano].custo += Number(r.custo_pneu); porAno[ano].comCusto++; }
  });
  const anos = Object.keys(porAno).sort((a, b) => b - a);
  const tbodyAnual = document.getElementById('tabela-anual-tbody');
  if (tbodyAnual) {
    tbodyAnual.innerHTML = anos.length === 0
      ? '<tr><td colspan="4" class="empty-msg" style="text-align:center;padding:12px">Sem dados anuais ainda.</td></tr>'
      : anos.map(ano => {
          const d   = porAno[ano];
          const med = d.comCusto > 0 ? fmtEur(d.custo / d.comCusto) : '—';
          return `<tr>
            <td><strong>${ano}</strong></td>
            <td style="text-align:center">${d.pneus}</td>
            <td style="text-align:right">${d.custo > 0 ? fmtEur(d.custo) : '—'}</td>
            <td style="text-align:right">${med}</td>
          </tr>`;
        }).join('');
  }

  // ── Análise por posição (camiões) / eixo (reboques) — não combinável ──
  const painelPos = document.getElementById('inicio-analise-pos');
  if (inicioVista === 'unificada') {
    painelPos.classList.add('hidden');
  } else {
    painelPos.classList.remove('hidden');
    if (inicioVista === 'veiculos') renderInicioAnalisePosicao(pneus);
    else renderInicioAnaliseEixo(reboques);
  }
}

// Taxa de desgaste por posição (Direção vs. Tração) — camiões.
function renderInicioAnalisePosicao(pneusData) {
  document.getElementById('inicio-pos-titulo').textContent = 'Taxa de desgaste por posição (mm/1000km)';
  document.getElementById('inicio-pos-sub').textContent    = 'Direção vs. Tração: só com registos históricos completos (montagem, desmontagem e rasto final).';
  document.getElementById('inicio-pos-detalhe-titulo').textContent = 'Detalhe por posição';
  document.getElementById('inicio-pos-thead').innerHTML =
    '<tr><th>Posição</th><th style="text-align:right">Taxa média (mm/1000km)</th><th style="text-align:right">KMs médios efetuados</th><th style="text-align:center">Nº registos</th></tr>';

  const posAgg = {};
  pneusData.forEach(r => {
    const taxa = taxaDesgaste(r);
    if (taxa === null) return;
    const k = categoriaPosicao(r.posicao);
    if (!k) return;
    if (!posAgg[k]) posAgg[k] = { taxaArr: [], kmsArr: [] };
    posAgg[k].taxaArr.push(taxa);
    posAgg[k].kmsArr.push(r.kms_desmont - r.kms_mont);
  });

  const posKeys = ['Direção', 'Tração', ...Object.keys(posAgg).filter(k => k !== 'Direção' && k !== 'Tração')]
    .filter(k => posAgg[k]);
  const tbody = document.getElementById('desgaste-pos-tbody');
  if (posKeys.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-msg" style="text-align:center;padding:12px">Sem registos históricos com rasto final ainda.</td></tr>';
  } else {
    tbody.innerHTML = posKeys.map(k => {
      const a     = posAgg[k];
      const taxaM = a.taxaArr.reduce((s, v) => s + v, 0) / a.taxaArr.length;
      const kmsM  = a.kmsArr.reduce((s, v) => s + v, 0) / a.kmsArr.length;
      return `<tr>
        <td>${k}</td>
        <td style="text-align:right">${taxaM.toFixed(3)}</td>
        <td style="text-align:right">${fmt(Math.round(kmsM))}</td>
        <td style="text-align:center">${a.taxaArr.length}</td>
      </tr>`;
    }).join('');
  }

  if (posKeys.length > 0) {
    const vals = posKeys.map(k => Number((posAgg[k].taxaArr.reduce((s, v) => s + v, 0) / posAgg[k].taxaArr.length).toFixed(3)));
    mkChart('c-posicao-eixo', 'bar', posKeys, vals, CHART_NEUTRAL);
  }
}

// Duração média por eixo — reboques.
function renderInicioAnaliseEixo(reboquesData) {
  document.getElementById('inicio-pos-titulo').textContent = 'Duração média por eixo (meses)';
  document.getElementById('inicio-pos-sub').textContent    = 'Só com desmontagens já registadas.';
  document.getElementById('inicio-pos-detalhe-titulo').textContent = 'Detalhe por eixo';
  document.getElementById('inicio-pos-thead').innerHTML =
    '<tr><th>Eixo</th><th style="text-align:right">Duração média (meses)</th><th style="text-align:center">Nº registos</th></tr>';

  const agg = {};
  reboquesData.forEach(r => {
    if (!r.mes_desmont || !r.mes_mont) return;
    const meses = mesesEntre(r.mes_mont, r.mes_desmont);
    if (meses <= 0) return;
    if (!r.eixo) return;
    const k = `Eixo ${r.eixo}`;
    if (!agg[k]) agg[k] = [];
    agg[k].push(meses);
  });

  const keys = ['Eixo 1', 'Eixo 2', 'Eixo 3', ...Object.keys(agg).filter(k => !['Eixo 1', 'Eixo 2', 'Eixo 3'].includes(k))]
    .filter(k => agg[k]);
  const tbody = document.getElementById('desgaste-pos-tbody');
  if (keys.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-msg" style="text-align:center;padding:12px">Sem desmontagens registadas ainda.</td></tr>';
  } else {
    tbody.innerHTML = keys.map(k => {
      const arr   = agg[k];
      const media = Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
      return `<tr><td>${k}</td><td style="text-align:right">${media}</td><td style="text-align:center">${arr.length}</td></tr>`;
    }).join('');
  }

  if (keys.length > 0) {
    const vals = keys.map(k => Math.round(agg[k].reduce((s, v) => s + v, 0) / agg[k].length));
    mkChart('c-posicao-eixo', 'bar', keys, vals, CHART_NEUTRAL);
  }
}

// ── PAINEL — REGISTAR PNEU ──────────────────────────────────────────
// O formulário já não ocupa sempre o ecrã de Início — abre à parte,
// no mesmo painel lateral usado noutras páginas (ver abrirPainel em
// frota.js), para não competir com o resumo geral.

function abrirPainelRegistoGeral() {
  document.getElementById('painel-registo-geral').classList.add('open');
}

function fecharPainelRegistoGeral() {
  document.getElementById('painel-registo-geral').classList.remove('open');
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

  const { data: extra } = await fetchAllRows(() => sb.from(tabela).select('matricula').eq('empresa_id', currentEmpresaId));
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
    rasto_final: null,
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
