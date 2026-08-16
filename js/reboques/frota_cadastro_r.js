// ── FROTA — GESTÃO DE REBOQUES ────────────────────────────────────

let listaReboquesFrota = [];
let editReboqueFrotaId  = null;

// Lista fixa de marcas de reboque — igual para todos os clientes, não é
// gerida por empresa (ao contrário das marcas de pneus).
const MARCAS_REBOQUE = [
  { slug: 'lecitrailer', nome: 'Lecitrailer',        scale: 2.3, maxW: 105, maxH: 34 },
  { slug: 'krone',       nome: 'Krone',    ext: 'jpg',  scale: 2.5, maxW: 120 },
  { slug: 'kogel',       nome: 'Kögel' },
  { slug: 'stas',        nome: 'Stas',     ext: 'webp', scale: 2.5, maxW: 120 },
  { slug: 'montenegro',  nome: 'Montenegro' },
  { slug: 'trouillet',   nome: 'Trouillet',          scale: 1.6 },
  { slug: 'schmitz',     nome: 'Schmitz Cargobull',  scale: 1.7 },
  { slug: 'spitzer',     nome: 'Spitzer',            scale: 2.1, maxW: 100 },
  { slug: 'lecinena',    nome: 'Lecinena',           scale: 1.6 },
  { slug: 'benalu',      nome: 'Benalu',             scale: 1.6 },
  { slug: 'guillen',     nome: 'Guillén',            scale: 2.5, maxW: 120 },
  { slug: 'broshuis',    nome: 'Broshuis',           scale: 1.6 },
  { slug: 'hermanns',    nome: 'Hermanns',           scale: 1.6 },
  { slug: 'fruehauf',    nome: 'Fruehauf',           scale: 1.3 },
  { slug: 'invepe',      nome: 'Invepe',             scale: 1.6 },
  { slug: 'renders',     nome: 'Renders',  ext: 'svg', scale: 1.6 },
  { slug: 'lamberet',    nome: 'Lamberet', ext: 'webp', scale: 1.7 },
  { slug: 'wielton',     nome: 'Wielton',  ext: 'jpg',  scale: 3.4, maxW: 155 },
  { slug: 'kassbohrer',  nome: 'Kässbohrer',          scale: 2.2, maxW: 100 },
  { slug: 'pacton',      nome: 'Pacton',   ext: 'jpg', scale: 2, maxH: 34 },
  { slug: 'seka',        nome: 'Seka',                scale: 2, maxH: 34 },
];

// Nº de pneus esperados (ativos) consoante a configuração de eixos.
// Derivado de SLOTS_REBOQUE (js/utils.js), que é a lista completa dos
// lugares fixos por configuração.
const EIXOS_TYRES_REBOQUE = Object.fromEntries(
  Object.entries(SLOTS_REBOQUE).map(([k, v]) => [k, v.length])
);

function logoMarcaReboque(nome) {
  const m = MARCAS_REBOQUE.find(x => x.nome === nome);
  return m ? `assets/marcas-reboques/${m.slug}.${m.ext || 'png'}` : null;
}

function logoScaleReboque(nome) {
  const m = MARCAS_REBOQUE.find(x => x.nome === nome);
  return (m && m.scale) || 1;
}

// Limite de largura em px — a maioria partilha um teto comum, mas algumas
// marcas têm um logo "vazio" (muito espaço à volta do desenho) e precisam
// de um teto próprio mais alto para a escala fazer efeito visível.
function logoMaxWReboque(nome, base) {
  const m = MARCAS_REBOQUE.find(x => x.nome === nome);
  return (m && m.maxW) ? Math.round(m.maxW * (base / 46)) : base;
}

// Teto de altura em px — normalmente todas partilham o mesmo (para as
// linhas do formulário não desalinharem), mas uma marca "curta" (pouco
// larga) pode ficar presa por este teto antes de a largura fazer efeito;
// aqui dá para abrir uma exceção pontual, com cuidado para não voltar a
// ficar mais alta que os campos ao lado.
function logoMaxHReboque(nome, base) {
  const m = MARCAS_REBOQUE.find(x => x.nome === nome);
  return (m && m.maxH) ? Math.round(m.maxH * (base / 28)) : base;
}

// HTML da marca para o cartão de "Por reboque" — só o logo (maior, já
// que não precisa de partilhar a linha com o nome); sem logo conhecido,
// mostra o nome em texto na mesma.
function renderMarcaComLogoReboque(nome) {
  if (!nome) return '—';
  const src = logoMarcaReboque(nome);
  if (!src) return nome;
  const escala = logoScaleReboque(nome);
  const h = Math.min(Math.round(24 * escala), logoMaxHReboque(nome, 30));
  const mw = Math.min(Math.round(48 * escala), logoMaxWReboque(nome, 70));
  return `<img src="${src}" alt="${nome}" title="${nome}" style="height:${h}px;width:auto;max-width:${mw}px;object-fit:contain">`;
}

// Atualiza o mini-logo e mostra/esconde o campo "Outra" consoante a
// opção selecionada no select de marca indicado (ex: 'vr-marca', 'evr-marca').
function atualizarMarcaReboque(selectId) {
  const sel      = document.getElementById(selectId);
  const logo     = document.getElementById(selectId + '-logo');
  const outraInp = document.getElementById(selectId + '-outra');
  if (!sel) return;

  const ehOutra = sel.value === 'Outra';
  if (outraInp) outraInp.classList.toggle('hidden', !ehOutra);

  const src = logoMarcaReboque(sel.value);
  if (logo) {
    if (src) {
      logo.src = src;
      const escala = logoScaleReboque(sel.value);
      logo.style.height   = Math.min(Math.round(22 * escala), logoMaxHReboque(sel.value, 28)) + 'px';
      logo.style.maxWidth = Math.min(Math.round(46 * escala), logoMaxWReboque(sel.value, 64)) + 'px';
      logo.style.display  = 'block';
    } else {
      logo.style.display = 'none';
    }
  }
}

// Devolve o nome final da marca, resolvendo "Outra" para o texto livre
function obterMarcaReboque(selectId) {
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
function definirMarcaReboque(selectId, nomeAtual) {
  const sel      = document.getElementById(selectId);
  const outraInp = document.getElementById(selectId + '-outra');
  if (!sel) return;

  const conhecida = MARCAS_REBOQUE.some(m => m.nome === nomeAtual);
  if (nomeAtual && !conhecida) {
    sel.value = 'Outra';
    if (outraInp) outraInp.value = nomeAtual;
  } else {
    sel.value = nomeAtual || '';
    if (outraInp) outraInp.value = '';
  }
  atualizarMarcaReboque(selectId);
}

async function carregarListaReboquesFrota() {
  const { data } = await sb.from('reboques_frota').select('*').eq('ativo', true).order('matricula');
  listaReboquesFrota = data || [];
  await popularSelectorReboquesFrota();
}

// Selector de matrícula do formulário de registo — combina os reboques da
// tabela `reboques_frota` com matrículas que só existem em `reboques`
// (registos antigos, sem ficha de reboque criada ainda), mantendo-as a
// funcionar normalmente (mostradas só com a matrícula).
async function popularSelectorReboquesFrota() {
  const sel = document.getElementById('rr-mat');
  if (!sel) return;

  const { data: reboquesData } = await sb.from('reboques').select('matricula');
  const matsReboques = [...new Set((reboquesData || []).map(r => r.matricula))];

  const mapa = {};
  listaReboquesFrota.forEach(v => { mapa[v.matricula] = v; });
  matsReboques.forEach(m => { if (!mapa[m]) mapa[m] = { matricula: m }; });

  const mats = Object.values(mapa).sort((a, b) => a.matricula.localeCompare(b.matricula));

  const val = sel.value;
  sel.innerHTML = '<option value="">— selecionar —</option>' +
    mats.map(v => {
      const label = (v.marca || v.modelo)
        ? `${v.matricula} — ${[v.marca, v.modelo].filter(Boolean).join(' ')}`
        : v.matricula;
      return `<option value="${v.matricula}"${v.matricula === val ? ' selected' : ''}>${label}</option>`;
    }).join('');
}

// ── PÁGINA FROTA — REBOQUES (GESTÃO) ──────────────────────────────

async function initFrotaCadastroReboques() {
  await loadFrotaCadastroReboques();
}

async function loadFrotaCadastroReboques() {
  loading(true);
  const [{ data, error }, { data: reboquesData }] = await Promise.all([
    sb.from('reboques_frota').select('*').eq('ativo', true).order('matricula'),
    sb.from('reboques').select('matricula, mes_desmont'),
  ]);
  loading(false);
  if (error || !data) return;

  listaReboquesFrota = data;

  // Pneus ativos (sem desmontagem) por matrícula — esperado: 2 pneus por eixo
  const activosPorMat = {};
  (reboquesData || []).forEach(r => {
    if (!r.mes_desmont) activosPorMat[r.matricula] = (activosPorMat[r.matricula] || 0) + 1;
  });

  const tbody = document.getElementById('frota-cadastro-r-tbody');
  if (!tbody) return;
  tbody.innerHTML = data.map(v => {
    const esperados = EIXOS_TYRES_REBOQUE[v.num_eixos];
    const activos   = activosPorMat[v.matricula] || 0;
    const aviso     = esperados != null && activos < esperados;
    return `<tr>
    <td><strong>${v.matricula}</strong>${aviso ? ` <span title="Só ${activos} de ${esperados} pneus ativos" style="color:var(--red)">●</span>` : ''}</td>
    <td>${v.marca || '—'}</td>
    <td>${v.modelo || '—'}</td>
    <td>${v.ano || '—'}</td>
    <td>${v.tipo || '—'}</td>
    <td style="text-align:center">${v.num_eixos || '—'}</td>
    <td>
      <div style="display:flex;gap:4px">
        <button class="btn btn-sm btn-icon" onclick="abrirEdicaoReboqueFrota(${v.id})" title="Editar"><svg viewBox="0 0 24 24"><use href="#icon-edit"/></svg></button>
        <button class="btn btn-sm btn-icon btn-danger" onclick="apagarReboqueFrota(${v.id},'${v.matricula}')" title="Apagar"><svg viewBox="0 0 24 24"><use href="#icon-trash"/></svg></button>
      </div>
    </td>
  </tr>`;
  }).join('');
}

async function adicionarReboqueFrota() {
  const mat      = document.getElementById('vr-mat').value.trim().toUpperCase();
  const marca    = obterMarcaReboque('vr-marca');
  const modelo   = document.getElementById('vr-modelo').value.trim();
  const anoStr   = document.getElementById('vr-ano').value;
  const tipo     = document.getElementById('vr-tipo').value;
  const eixos    = document.getElementById('vr-eixos').value;
  const obs      = document.getElementById('vr-obs').value.trim();

  if (!mat) { showFeedback('vr-feedback', 'Matrícula é obrigatória.', true); return; }

  const registo = {
    empresa_id:  currentEmpresaId,
    matricula:   mat,
    marca:       marca  || null,
    modelo:      modelo || null,
    ano:         anoStr   !== '' ? parseInt(anoStr)   : null,
    tipo:        tipo    || null,
    num_eixos:   eixos  || null,
    observacoes: obs     || null,
  };

  loading(true);
  const { error } = await sb.from('reboques_frota').insert([registo]);
  loading(false);

  if (error) { showFeedback('vr-feedback', 'Erro ao guardar: ' + error.message, true); return; }

  showFeedback('vr-feedback', 'Reboque adicionado.');
  limparFormReboqueFrota();
  await carregarListaReboquesFrota();
  await loadFrotaCadastroReboques();
}

function limparFormReboqueFrota() {
  ['vr-mat', 'vr-marca', 'vr-marca-outra', 'vr-modelo', 'vr-ano', 'vr-eixos', 'vr-obs']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('vr-tipo').value = '';
  atualizarMarcaReboque('vr-marca');
}

async function abrirEdicaoReboqueFrota(id) {
  const v = listaReboquesFrota.find(x => x.id === id);
  if (!v) return;
  editReboqueFrotaId = id;

  document.getElementById('evr-mat').value    = v.matricula   || '';
  definirMarcaReboque('evr-marca', v.marca || '');
  document.getElementById('evr-modelo').value = v.modelo      || '';
  document.getElementById('evr-ano').value    = v.ano         || '';
  document.getElementById('evr-tipo').value   = v.tipo        || '';
  document.getElementById('evr-eixos').value  = v.num_eixos   || '';
  document.getElementById('evr-obs').value    = v.observacoes || '';

  document.getElementById('evr-feedback').classList.add('hidden');
  document.getElementById('painel-editar-veiculo-r').classList.add('open');
}

function fecharEdicaoReboqueFrota() {
  document.getElementById('painel-editar-veiculo-r').classList.remove('open');
  editReboqueFrotaId = null;
}

async function guardarEdicaoReboqueFrota() {
  if (editReboqueFrotaId == null) return;

  const mat      = document.getElementById('evr-mat').value.trim().toUpperCase();
  const marca    = obterMarcaReboque('evr-marca');
  const modelo   = document.getElementById('evr-modelo').value.trim();
  const anoStr   = document.getElementById('evr-ano').value;
  const tipo     = document.getElementById('evr-tipo').value;
  const eixos    = document.getElementById('evr-eixos').value;
  const obs      = document.getElementById('evr-obs').value.trim();

  if (!mat) { showFeedback('evr-feedback', 'Matrícula é obrigatória.', true); return; }

  const updates = {
    matricula:   mat,
    marca:       marca  || null,
    modelo:      modelo || null,
    ano:         anoStr   !== '' ? parseInt(anoStr)   : null,
    tipo:        tipo    || null,
    num_eixos:   eixos  || null,
    observacoes: obs     || null,
  };

  loading(true);
  const { error } = await sb.from('reboques_frota').update(updates).eq('id', editReboqueFrotaId);
  loading(false);

  if (error) { showFeedback('evr-feedback', 'Erro: ' + error.message, true); return; }

  showFeedback('evr-feedback', 'Reboque atualizado.');
  await carregarListaReboquesFrota();
  setTimeout(() => { fecharEdicaoReboqueFrota(); loadFrotaCadastroReboques(); }, 800);
}

async function apagarReboqueFrota(id, matricula) {
  if (!confirm(`Tem a certeza que quer apagar o reboque ${matricula}? Esta ação não pode ser desfeita.`)) return;
  loading(true);
  const { error } = await sb.from('reboques_frota').delete().eq('id', id);
  loading(false);
  if (error) { alert('Erro ao apagar: ' + error.message); return; }
  await carregarListaReboquesFrota();
  await loadFrotaCadastroReboques();
}

function toggleListaReboquesFrota() {
  const wrap   = document.getElementById('lista-reboques-wrap');
  const toggle = document.getElementById('lista-reboques-toggle');
  wrap.classList.toggle('hidden');
  toggle.textContent = wrap.classList.contains('hidden') ? '▸ Expandir' : '▾ Recolher';
}
