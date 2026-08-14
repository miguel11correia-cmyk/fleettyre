// ── FORMATAÇÃO ────────────────────────────────────────────────────

function fmt(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('pt-PT');
}

function fmtEur(n) {
  if (n == null || n === '') return '—';
  return '€\u202f' + Number(n).toLocaleString('pt-PT', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

function tipoBadge(t) {
  if (!t) return '';
  if (t === 'Novo')        return `<span class="badge b-novo">Novo</span>`;
  if (t === 'Remix')       return `<span class="badge b-remix">Remix</span>`;
  if (t === 'Piso Aberto') return `<span class="badge b-piso">Piso Aberto</span>`;
  if (t === 'Rechapado')   return `<span class="badge b-rechapado">Rechapado</span>`;
  return `<span class="badge">${t}</span>`;
}

function countBy(arr, key) {
  return arr.reduce((m, r) => {
    const k = r[key] || '(sem registo)';
    m[k] = (m[k] || 0) + 1;
    return m;
  }, {});
}

function makeLegend(labels, colors) {
  return labels
    .map((l, i) => `<span><span class="lsq" style="background:${colors[i % colors.length]}"></span>${l}</span>`)
    .join('');
}

// ── CÁLCULOS DE DESGASTE ──────────────────────────────────────────

function escIni(tipo) {
  if (tipo === 'Remix')       return 14;
  if (tipo === 'Rechapado')   return 14;
  if (tipo === 'Piso Aberto') return 12;
  return 16;
}

function taxaDesgaste(r) {
  const kmsEf = (r.kms_desmont || 0) - (r.kms_mont || 0);
  if (kmsEf <= 0) return null;
  const efinal = r.escultura_final;
  if (efinal == null || efinal < 0 || efinal > 20) return null;
  const eini = escIni(r.tipo);
  const desgaste = eini - efinal;
  if (desgaste < 0) return null;
  return (desgaste / kmsEf) * 1000;
}

// Kms efetuados por um registo de pneu — real quando já foi desmontado
// (kms_desmont - kms_mont, como sempre), ou estimado a partir do km
// atual do veículo (integração Cartrack) quando ainda está montado e
// essa informação existe. Devolve null quando não há forma de saber —
// mantém o comportamento antigo para veículos/frotas sem essa integração.
function kmsEfectuados(r, kmAtualVeiculo) {
  if (r.kms_desmont && r.kms_mont && r.kms_desmont > r.kms_mont) {
    return { km: r.kms_desmont - r.kms_mont, estimado: false };
  }
  if (!r.mes_desmont && kmAtualVeiculo != null && r.kms_mont && kmAtualVeiculo > r.kms_mont) {
    return { km: kmAtualVeiculo - r.kms_mont, estimado: true };
  }
  return null;
}

function mesesEntre(mesInicio, mesFim) {
  if (!mesInicio || !mesFim) return 0;
  const [aI, mI] = mesInicio.split('-').map(Number);
  const [aF, mF] = mesFim.split('-').map(Number);
  return (aF - aI) * 12 + (mF - mI);
}

function mesAtual() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ── LUGARES FIXOS (posição/eixo) ─────────────────────────────────
//
// Lista fixa de lugares de pneu por configuração de eixos. Cada
// veículo/reboque com uma configuração conhecida mostra sempre estas
// linhas em "Por matrícula"/"Por reboque" — preenchidas ou vazias.
// A ordem de cada lista é também a ordem em que a quantidade do
// registo é distribuída pelos lugares livres dessa categoria.

const SLOTS_VEICULO = {
  '4x2': [
    'Direção Esquerda', 'Direção Direita',
    'Tração Esquerda Interior', 'Tração Esquerda Exterior',
    'Tração Direita Interior', 'Tração Direita Exterior',
  ],
  '6x2 Pusher': [
    'Direção Esquerda', 'Direção Direita',
    'Pusher Esquerda Interior', 'Pusher Esquerda Exterior',
    'Pusher Direita Interior', 'Pusher Direita Exterior',
    'Tração Esquerda Interior', 'Tração Esquerda Exterior',
    'Tração Direita Interior', 'Tração Direita Exterior',
  ],
  '6x2 Tag': [
    'Direção Esquerda', 'Direção Direita',
    'Tração Esquerda Interior', 'Tração Esquerda Exterior',
    'Tração Direita Interior', 'Tração Direita Exterior',
    'Tag Esquerda Interior', 'Tag Esquerda Exterior',
    'Tag Direita Interior', 'Tag Direita Exterior',
  ],
};

const SLOTS_REBOQUE = {
  '2x2': [
    'Eixo 1 Esquerda', 'Eixo 1 Direita',
    'Eixo 2 Esquerda', 'Eixo 2 Direita',
  ],
  '2x2x2': [
    'Eixo 1 Esquerda', 'Eixo 1 Direita',
    'Eixo 2 Esquerda', 'Eixo 2 Direita',
    'Eixo 3 Esquerda', 'Eixo 3 Direita',
  ],
  '2x2x2 (rodado duplo)': [
    'Eixo 1 Esquerda Interior', 'Eixo 1 Esquerda Exterior',
    'Eixo 1 Direita Interior', 'Eixo 1 Direita Exterior',
    'Eixo 2 Esquerda Interior', 'Eixo 2 Esquerda Exterior',
    'Eixo 2 Direita Interior', 'Eixo 2 Direita Exterior',
    'Eixo 3 Esquerda Interior', 'Eixo 3 Esquerda Exterior',
    'Eixo 3 Direita Interior', 'Eixo 3 Direita Exterior',
  ],
};

// Família de um lugar granular ("Tração Esquerda Interior" → "Tração",
// "Eixo 2 Esquerda" → "Eixo 2"). Usado para agrupar por eixo/categoria
// em vez de por lugar exacto (registo, dashboard, taxa de desgaste).
function categoriaPosicao(pos) {
  if (!pos) return null;
  const partes = pos.split(' ');
  return partes[0] === 'Eixo' ? partes.slice(0, 2).join(' ') : partes[0];
}

// Categorias distintas de uma lista de lugares, pela ordem em que
// aparecem (ex: SLOTS_VEICULO['6x2 Pusher'] → ['Direção','Pusher','Tração']).
function categoriasDeConfig(lista) {
  if (!lista) return [];
  return [...new Set(lista.map(categoriaPosicao))];
}

// Lugares de uma categoria, pela ordem fixa da lista.
function lugaresDaCategoria(lista, categoria) {
  if (!lista) return [];
  return lista.filter(p => categoriaPosicao(p) === categoria);
}

// Deriva o nº de eixo (inteiro) a partir de um lugar granular de
// reboque, para continuar a alimentar LIMITES_EIXO sem alterações lá.
function eixoDoLugar(pos) {
  if (!pos) return null;
  const m = /^Eixo (\d+)/.exec(pos);
  return m ? parseInt(m[1], 10) : null;
}

// Popula um <select> de categoria (posição/eixo) consoante a
// configuração do veículo/reboque escolhido noutro <select> de
// matrícula. Guarda as opções originais do próprio <select> (definidas
// no HTML) na primeira vez que corre, e usa-as como "fallback" quando
// a matrícula não tem ficha ou a configuração é "Outro" — mantendo o
// comportamento actual nesses casos.
const _opcoesPosicaoFallback = {};
function atualizarCategoriasPosicao(selMatId, selPosId, lista, slotsConfig) {
  const selMat = document.getElementById(selMatId);
  const selPos = document.getElementById(selPosId);
  if (!selMat || !selPos) return;

  if (!(selPosId in _opcoesPosicaoFallback)) {
    _opcoesPosicaoFallback[selPosId] = selPos.innerHTML;
  }

  const item   = (lista || []).find(v => v.matricula === selMat.value);
  const slots  = item ? slotsConfig[item.num_eixos] : null;
  const val    = selPos.value;

  selPos.innerHTML = slots
    ? '<option value="">— selecionar —</option>' +
      categoriasDeConfig(slots).map(c => `<option value="${c}">${c}</option>`).join('')
    : _opcoesPosicaoFallback[selPosId];

  if ([...selPos.options].some(o => o.value === val)) selPos.value = val;
}

// Popula o <select> de lugar do painel de edição (um pneu de cada
// vez): mostra os lugares livres dessa categoria + o lugar actual do
// próprio pneu (para poder ficar como está), pela ordem fixa da
// configuração. Sem configuração conhecida, mantém as opções estáticas
// já existentes no <select> (Direção/Tração ou Eixo 1/2/3) e só
// selecciona o valor actual.
async function atualizarLugaresEdicao(selPosId, tabela, matricula, posAtual, numEixos, slotsConfig, idExcluir) {
  const sel = document.getElementById(selPosId);
  if (!sel) return;

  if (!(selPosId in _opcoesPosicaoFallback)) {
    _opcoesPosicaoFallback[selPosId] = sel.innerHTML;
  }

  const slots = slotsConfig[numEixos];
  if (!slots) {
    sel.innerHTML = _opcoesPosicaoFallback[selPosId];
    if (posAtual && [...sel.options].every(o => o.value !== posAtual)) {
      sel.innerHTML += `<option value="${posAtual}">${posAtual}</option>`;
    }
    sel.value = posAtual || '';
    return;
  }

  const { data } = await sb.from(tabela).select('id,posicao')
    .eq('matricula', matricula).is('mes_desmont', null);
  const ocupados = new Set((data || []).filter(r => r.id !== idExcluir).map(r => r.posicao));
  const opcoes = slots.filter(p => !ocupados.has(p) || p === posAtual);

  sel.innerHTML = '<option value="">— selecionar —</option>' +
    opcoes.map(p => `<option value="${p}">${p}</option>`).join('');
  sel.value = posAtual || '';
}

// Calcula os lugares a atribuir num registo em massa (categoria +
// quantidade): se a configuração tiver lugares definidos para a
// categoria escolhida, distribui a quantidade pelos lugares livres
// dessa categoria (por ordem fixa); caso contrário devolve a
// categoria repetida (comportamento actual, sem lugar granular).
async function resolverLugaresRegisto(tabela, matricula, categoria, quantidade, numEixos, slotsConfig) {
  const lista = slotsConfig[numEixos];
  const lugaresCategoria = lista ? lugaresDaCategoria(lista, categoria) : [];

  if (!categoria || lugaresCategoria.length === 0) {
    return { ok: true, posicoes: Array(quantidade).fill(categoria || null) };
  }

  const { data } = await sb.from(tabela).select('posicao')
    .eq('matricula', matricula).is('mes_desmont', null);
  const ocupados = new Set((data || []).map(r => r.posicao));
  const livres = lugaresCategoria.filter(p => !ocupados.has(p));

  if (livres.length < quantidade) {
    return { ok: false, erro: `Só há ${livres.length} lugar(es) livre(s) em "${categoria}" para ${matricula}.` };
  }
  return { ok: true, posicoes: livres.slice(0, quantidade) };
}

// ── UI HELPERS ────────────────────────────────────────────────────

function loading(show) {
  document.getElementById('loading').classList.toggle('hidden', !show);
}

function showFeedback(id, msg, isError = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'feedback ' + (isError ? 'error' : 'success');
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3500);
}

// ── GRÁFICOS ──────────────────────────────────────────────────────

function mkChart(id, type, labels, data, colors, extraOpts = {}) {
  if (charts[id]) { charts[id].destroy(); }
  const el = document.getElementById(id);
  if (!el) return;
  const gridC = '#e5e4df';
  const tickC = '#8a8884';

  const baseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
  };

  const scalesBar = {
    x: { grid: { color: gridC }, ticks: { color: tickC, font: { size: 10 }, maxRotation: 40, autoSkip: false } },
    y: { grid: { color: gridC }, ticks: { color: tickC, font: { size: 10 } } },
  };
  const scalesBarH = {
    x: { grid: { color: gridC }, ticks: { color: tickC, font: { size: 10 } } },
    y: { grid: { display: false }, ticks: { color: tickC, font: { size: 10 } } },
  };

  let opts = { ...baseOpts };
  if (type === 'bar')      opts.scales = extraOpts.indexAxis === 'y' ? scalesBarH : scalesBar;
  if (type === 'line')     opts.scales = scalesBar;
  if (type === 'doughnut') opts.cutout = '62%';

  const dataset = {
    data,
    borderWidth: type === 'line' ? 2 : 0,
    borderRadius: type === 'bar' ? 4 : 0,
  };

  if (type === 'line') {
    dataset.borderColor         = colors[0];
    dataset.backgroundColor     = 'transparent';
    dataset.tension             = 0.3;
    dataset.fill                = false;
    dataset.pointBackgroundColor = colors[0];
    dataset.pointRadius         = 3;
  } else {
    dataset.backgroundColor = colors;
  }

  charts[id] = new Chart(el, {
    type,
    data: { labels, datasets: [dataset] },
    options: { ...opts, ...extraOpts },
  });
}
