// ── FROTA — GESTÃO DE VEÍCULOS ────────────────────────────────────

let listaVeiculos = [];
let editVeiculoId  = null;

// Lista fixa de marcas de camião — igual para todos os clientes, não é
// gerida por empresa (ao contrário das marcas de pneus).
const MARCAS_VEICULO = [
  { slug: 'volvo',    nome: 'Volvo' },
  { slug: 'scania',   nome: 'Scania' },
  { slug: 'man',      nome: 'MAN',      scale: 1.3 },
  { slug: 'daf',      nome: 'DAF',      scale: 1.3 },
  { slug: 'mercedes', nome: 'Mercedes-Benz' },
  { slug: 'iveco',    nome: 'Iveco',    scale: 1.3 },
  { slug: 'renault',  nome: 'Renault Trucks' },
  { slug: 'ford',     nome: 'Ford Trucks' },
];

// Nº de pneus esperados (activos) consoante a configuração de eixos —
// "Outro" fica de fora porque não há uma contagem fixa para comparar.
const EIXOS_TYRES_VEICULO = { '4x2': 6, '6x2 Pusher': 10, '6x2 Tag': 10 };

function logoMarcaVeiculo(nome) {
  const m = MARCAS_VEICULO.find(x => x.nome === nome);
  return m ? `assets/marcas/${m.slug}.svg` : null;
}

function logoScaleVeiculo(nome) {
  const m = MARCAS_VEICULO.find(x => x.nome === nome);
  return (m && m.scale) || 1;
}

// HTML da marca com mini-logo à frente, para o cartão de "Por matrícula"
function renderMarcaComLogo(nome) {
  if (!nome) return '—';
  const src = logoMarcaVeiculo(nome);
  if (!src) return nome;
  const escala = logoScaleVeiculo(nome);
  const h = Math.round(16 * escala);
  const mw = Math.round(28 * escala);
  return `<img src="${src}" alt="" style="height:${h}px;width:auto;max-width:${mw}px;object-fit:contain;vertical-align:-3px;margin-right:5px">${nome}`;
}

// Actualiza o mini-logo e mostra/esconde o campo "Outra" consoante a
// opção seleccionada no select de marca indicado (ex: 'v-marca', 'ev-marca').
function atualizarMarcaVeiculo(selectId) {
  const sel      = document.getElementById(selectId);
  const logo     = document.getElementById(selectId + '-logo');
  const outraInp = document.getElementById(selectId + '-outra');
  if (!sel) return;

  const ehOutra = sel.value === 'Outra';
  if (outraInp) outraInp.classList.toggle('hidden', !ehOutra);

  const src = logoMarcaVeiculo(sel.value);
  if (logo) {
    if (src) {
      logo.src = src;
      const escala = logoScaleVeiculo(sel.value);
      logo.style.height   = Math.round(22 * escala) + 'px';
      logo.style.maxWidth = Math.round(38 * escala) + 'px';
      logo.style.display  = '';
    } else {
      logo.style.display = 'none';
    }
  }
}

// Devolve o nome final da marca, resolvendo "Outra" para o texto livre
function obterMarcaVeiculo(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return '';
  if (sel.value === 'Outra') {
    const outraInp = document.getElementById(selectId + '-outra');
    return outraInp ? outraInp.value.trim() : '';
  }
  return sel.value;
}

// Prepara o select de marca (e o campo "Outra"/logo) para mostrar um valor
// já guardado — usado ao abrir o painel de edição.
function definirMarcaVeiculo(selectId, nomeActual) {
  const sel      = document.getElementById(selectId);
  const outraInp = document.getElementById(selectId + '-outra');
  if (!sel) return;

  const conhecida = MARCAS_VEICULO.some(m => m.nome === nomeActual);
  if (nomeActual && !conhecida) {
    sel.value = 'Outra';
    if (outraInp) outraInp.value = nomeActual;
  } else {
    sel.value = nomeActual || '';
    if (outraInp) outraInp.value = '';
  }
  atualizarMarcaVeiculo(selectId);
}

async function carregarListaVeiculos() {
  const { data } = await sb.from('veiculos').select('*').eq('ativo', true).order('matricula');
  listaVeiculos = data || [];
  await popularSelectorVeiculos();
}

// Selector de matrícula do formulário de registo — combina os veículos da
// tabela `veiculos` com matrículas que só existem em `pneus` (registos
// antigos, sem ficha de veículo criada ainda), mantendo-as a funcionar
// normalmente (mostradas só com a matrícula, sem dados de marca/modelo).
async function popularSelectorVeiculos() {
  const sel = document.getElementById('r-mat');
  if (!sel) return;

  const { data: pneusData } = await sb.from('pneus').select('matricula');
  const matsPneus = [...new Set((pneusData || []).map(r => r.matricula))];

  const mapa = {};
  listaVeiculos.forEach(v => { mapa[v.matricula] = v; });
  matsPneus.forEach(m => { if (!mapa[m]) mapa[m] = { matricula: m }; });

  const mats = Object.values(mapa).sort((a, b) => a.matricula.localeCompare(b.matricula));

  const val = sel.value;
  sel.innerHTML = '<option value="">— seleccionar —</option>' +
    mats.map(v => {
      const label = (v.marca || v.modelo)
        ? `${v.matricula} — ${[v.marca, v.modelo].filter(Boolean).join(' ')}`
        : v.matricula;
      return `<option value="${v.matricula}"${v.matricula === val ? ' selected' : ''}>${label}</option>`;
    }).join('');
}

// ── PÁGINA FROTA (GESTÃO) ─────────────────────────────────────────

async function initFrotaCadastro() {
  await loadFrotaCadastro();
}

async function loadFrotaCadastro() {
  loading(true);
  const [{ data, error }, { data: pneusData }] = await Promise.all([
    sb.from('veiculos').select('*').eq('ativo', true).order('matricula'),
    sb.from('pneus').select('matricula, mes_desmont'),
  ]);
  loading(false);
  if (error || !data) return;

  listaVeiculos = data;

  // Pneus activos (sem desmontagem) por matrícula
  const activosPorMat = {};
  (pneusData || []).forEach(r => {
    if (!r.mes_desmont) activosPorMat[r.matricula] = (activosPorMat[r.matricula] || 0) + 1;
  });

  const tbody = document.getElementById('frota-cadastro-tbody');
  if (!tbody) return;
  tbody.innerHTML = data.map(v => {
    const esperados = EIXOS_TYRES_VEICULO[v.num_eixos];
    const activos   = activosPorMat[v.matricula] || 0;
    const aviso     = esperados != null && activos < esperados;
    return `<tr>
    <td><strong>${v.matricula}</strong>${aviso ? ` <span title="Só ${activos} de ${esperados} pneus activos" style="color:var(--red)">●</span>` : ''}</td>
    <td>${v.marca || '—'}</td>
    <td>${v.modelo || '—'}</td>
    <td>${v.ano || '—'}</td>
    <td>${v.tipo || '—'}</td>
    <td style="text-align:center">${v.num_eixos || '—'}</td>
    <td>${v.reboque_hab || '—'}</td>
    <td>
      <div style="display:flex;gap:4px">
        <button class="btn btn-sm" onclick="abrirEdicaoVeiculo(${v.id})" style="height:28px;padding:0 8px;font-size:11px">✏️</button>
        <button class="btn btn-sm" onclick="apagarVeiculo(${v.id},'${v.matricula}')" style="height:28px;padding:0 8px;font-size:11px;color:var(--red);border-color:#f5c6c6">🗑</button>
      </div>
    </td>
  </tr>`;
  }).join('');
}

async function adicionarVeiculo() {
  const mat      = document.getElementById('v-mat').value.trim().toUpperCase();
  const marca    = obterMarcaVeiculo('v-marca');
  const modelo   = document.getElementById('v-modelo').value.trim();
  const anoStr   = document.getElementById('v-ano').value;
  const tipo     = document.getElementById('v-tipo').value;
  const eixos    = document.getElementById('v-eixos').value;
  const reboque  = document.getElementById('v-reboque').value.trim().toUpperCase();
  const obs      = document.getElementById('v-obs').value.trim();

  if (!mat) { showFeedback('v-feedback', 'Matrícula é obrigatória.', true); return; }

  const registo = {
    empresa_id:  currentEmpresaId,
    matricula:   mat,
    marca:       marca  || null,
    modelo:      modelo || null,
    ano:         anoStr   !== '' ? parseInt(anoStr)   : null,
    tipo:        tipo    || null,
    num_eixos:   eixos  || null,
    reboque_hab: reboque || null,
    observacoes: obs     || null,
  };

  loading(true);
  const { error } = await sb.from('veiculos').insert([registo]);
  loading(false);

  if (error) { showFeedback('v-feedback', 'Erro ao guardar: ' + error.message, true); return; }

  showFeedback('v-feedback', 'Veículo adicionado.');
  limparFormVeiculo();
  await carregarListaVeiculos();
  await loadFrotaCadastro();
}

function limparFormVeiculo() {
  ['v-mat', 'v-marca', 'v-marca-outra', 'v-modelo', 'v-ano', 'v-eixos', 'v-reboque', 'v-obs']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('v-tipo').value = '';
  atualizarMarcaVeiculo('v-marca');
}

async function abrirEdicaoVeiculo(id) {
  const v = listaVeiculos.find(x => x.id === id);
  if (!v) return;
  editVeiculoId = id;

  document.getElementById('ev-mat').value     = v.matricula    || '';
  definirMarcaVeiculo('ev-marca', v.marca || '');
  document.getElementById('ev-modelo').value  = v.modelo       || '';
  document.getElementById('ev-ano').value     = v.ano          || '';
  document.getElementById('ev-tipo').value    = v.tipo         || '';
  document.getElementById('ev-eixos').value   = v.num_eixos    || '';
  document.getElementById('ev-reboque').value = v.reboque_hab  || '';
  document.getElementById('ev-obs').value     = v.observacoes  || '';

  document.getElementById('ev-feedback').classList.add('hidden');
  document.getElementById('painel-editar-veiculo').classList.add('open');
}

function fecharEdicaoVeiculo() {
  document.getElementById('painel-editar-veiculo').classList.remove('open');
  editVeiculoId = null;
}

async function guardarEdicaoVeiculo() {
  if (editVeiculoId == null) return;

  const mat      = document.getElementById('ev-mat').value.trim().toUpperCase();
  const marca    = obterMarcaVeiculo('ev-marca');
  const modelo   = document.getElementById('ev-modelo').value.trim();
  const anoStr   = document.getElementById('ev-ano').value;
  const tipo     = document.getElementById('ev-tipo').value;
  const eixos    = document.getElementById('ev-eixos').value;
  const reboque  = document.getElementById('ev-reboque').value.trim().toUpperCase();
  const obs      = document.getElementById('ev-obs').value.trim();

  if (!mat) { showFeedback('ev-feedback', 'Matrícula é obrigatória.', true); return; }

  const updates = {
    matricula:   mat,
    marca:       marca  || null,
    modelo:      modelo || null,
    ano:         anoStr   !== '' ? parseInt(anoStr)   : null,
    tipo:        tipo    || null,
    num_eixos:   eixos  || null,
    reboque_hab: reboque || null,
    observacoes: obs     || null,
  };

  loading(true);
  const { error } = await sb.from('veiculos').update(updates).eq('id', editVeiculoId);
  loading(false);

  if (error) { showFeedback('ev-feedback', 'Erro: ' + error.message, true); return; }

  showFeedback('ev-feedback', 'Veículo actualizado.');
  await carregarListaVeiculos();
  setTimeout(() => { fecharEdicaoVeiculo(); loadFrotaCadastro(); }, 800);
}

async function apagarVeiculo(id, matricula) {
  if (!confirm(`Tem a certeza que quer apagar o veículo ${matricula}? Esta acção não pode ser desfeita.`)) return;
  loading(true);
  const { error } = await sb.from('veiculos').delete().eq('id', id);
  loading(false);
  if (error) { alert('Erro ao apagar: ' + error.message); return; }
  await carregarListaVeiculos();
  await loadFrotaCadastro();
}

function toggleListaVeiculos() {
  const wrap   = document.getElementById('lista-veiculos-wrap');
  const toggle = document.getElementById('lista-veiculos-toggle');
  wrap.classList.toggle('hidden');
  toggle.textContent = wrap.classList.contains('hidden') ? '▸ Expandir' : '▾ Recolher';
}
