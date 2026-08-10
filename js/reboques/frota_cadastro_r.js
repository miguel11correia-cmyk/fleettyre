// ── FROTA — GESTÃO DE REBOQUES ────────────────────────────────────

let listaReboquesFrota = [];
let editReboqueFrotaId  = null;

// Nº de pneus esperados (ativos) consoante a configuração de eixos
const EIXOS_TYRES_REBOQUE = { '2x2': 4, '2x2x2': 6, '2x2x2 (rodado duplo)': 12 };

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
        <button class="btn btn-sm" onclick="abrirEdicaoReboqueFrota(${v.id})" style="height:28px;padding:0 8px;font-size:11px">✏️</button>
        <button class="btn btn-sm" onclick="apagarReboqueFrota(${v.id},'${v.matricula}')" style="height:28px;padding:0 8px;font-size:11px;color:var(--red);border-color:#f5c6c6">🗑</button>
      </div>
    </td>
  </tr>`;
  }).join('');
}

async function adicionarReboqueFrota() {
  const mat      = document.getElementById('vr-mat').value.trim().toUpperCase();
  const marca    = document.getElementById('vr-marca').value.trim();
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
  ['vr-mat', 'vr-marca', 'vr-modelo', 'vr-ano', 'vr-eixos', 'vr-obs']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('vr-tipo').value = '';
}

async function abrirEdicaoReboqueFrota(id) {
  const v = listaReboquesFrota.find(x => x.id === id);
  if (!v) return;
  editReboqueFrotaId = id;

  document.getElementById('evr-mat').value    = v.matricula   || '';
  document.getElementById('evr-marca').value  = v.marca       || '';
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
  const marca    = document.getElementById('evr-marca').value.trim();
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
