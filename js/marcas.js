// ── MARCAS ────────────────────────────────────────────────────────

let marcGestaoExpandida = false;
let listaSubtipos       = [];
let subtipoMarcaId      = null;

async function loadMarcas() {
  loading(true);
  const { data, error } = await sb.from('pneus').select('*');
  loading(false);
  if (error || !data) return;

  const hoje = mesAtual();
  const agg  = {};
  data.filter(r => r.marca).forEach(r => {
    const k = r.marca;
    if (!agg[k]) agg[k] = { total: 0, novo: 0, remix: 0, rechapado: 0, piso: 0, kmsArr: [], custos: [], taxaArr: [] };
    agg[k].total++;
    if (r.tipo === 'Novo')             agg[k].novo++;
    else if (r.tipo === 'Remix')       agg[k].remix++;
    else if (r.tipo === 'Rechapado')   agg[k].rechapado++;
    else if (r.tipo === 'Piso Aberto') agg[k].piso++;
    if (r.kms_desmont && r.kms_mont)   agg[k].kmsArr.push(r.kms_desmont - r.kms_mont);
    if (r.custo_pneu > 0)              agg[k].custos.push(Number(r.custo_pneu));
    const taxa = taxaDesgaste(r);
    if (taxa !== null)                 agg[k].taxaArr.push(taxa);
  });

  const keys = Object.keys(agg).sort((a, b) => agg[b].total - agg[a].total);
  const tbody = document.getElementById('marc-tbody');
  if (tbody) {
    tbody.innerHTML = keys.map(k => {
      const m = agg[k];
      const kmsM = m.kmsArr.length > 0
        ? fmt(Math.round(m.kmsArr.reduce((s,v) => s+v, 0) / m.kmsArr.length))
        : '—';
      const custoM = m.custos.length > 0
        ? fmtEur(m.custos.reduce((s,v) => s+v, 0) / m.custos.length)
        : '—';
      const taxaM = m.taxaArr.length > 0
        ? (m.taxaArr.reduce((s,v) => s+v, 0) / m.taxaArr.length).toFixed(3)
        : '—';
      return `<tr>
        <td><strong>${k}</strong></td>
        <td>${m.total}</td><td>${m.novo}</td><td>${m.remix}</td><td>${m.rechapado}</td><td>${m.piso}</td>
        <td style="text-align:right">${kmsM}</td>
        <td style="text-align:right">${taxaM}</td>
        <td style="text-align:right">${custoM}</td>
      </tr>`;
    }).join('');
  }

  const keysComKms = keys.filter(k => agg[k].kmsArr.length > 0);
  if (keysComKms.length > 0) {
    mkChart('c-marc-km', 'bar',
      keysComKms,
      keysComKms.map(k => Math.round(agg[k].kmsArr.reduce((s,v) => s+v, 0) / agg[k].kmsArr.length)),
      CHART_NEUTRAL
    );
  }
}

async function renderGestaoMarcas() {
  const { data } = await sb.from('marcas').select('*').order('codigo');
  const container = document.getElementById('gestao-marcas');
  if (!container) return;

  const proximoCodigo = data && data.length > 0
    ? String(Math.max(...data.map(m => parseInt(m.codigo))) + 1).padStart(2, '0')
    : '01';

  container.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px;align-items:flex-end">
      <div class="frow" style="margin:0;flex:0 0 80px">
        <label>Código</label>
        <input type="text" id="nova-marc-cod" value="${proximoCodigo}" style="width:80px" maxlength="3">
      </div>
      <div class="frow" style="margin:0;flex:1">
        <label>Nome da marca</label>
        <input type="text" id="nova-marc-nome" placeholder="ex: MICHELIN" oninput="this.value=this.value.toUpperCase()">
      </div>
      <button class="btn btn-p" onclick="adicionarMarca()" style="flex-shrink:0">+ Adicionar</button>
    </div>
    <div onclick="toggleGestaoMarcas()" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;padding:6px 0;border-top:0.5px solid var(--border)">
      <span style="font-size:11px;color:var(--text2);font-weight:500">Lista de marcas (${(data || []).length})</span>
      <span style="font-size:11px;color:var(--text3)">${marcGestaoExpandida ? '▾ Recolher' : '▸ Expandir'}</span>
    </div>
    <div class="table-wrap${marcGestaoExpandida ? '' : ' hidden'}" style="margin-top:8px">
      <table>
        <thead><tr><th>Código</th><th>Nome</th><th>Acção</th></tr></thead>
        <tbody>
          ${(data || []).map(m => `<tr>
            <td><strong>${m.codigo}</strong></td>
            <td>${m.nome}</td>
            <td>
              <div style="display:flex;gap:4px">
                <button class="btn btn-sm" onclick="abrirSubtipos(${m.id},'${m.nome}')" style="font-size:11px;height:26px">🏷️ Subtipos</button>
                <button class="btn btn-sm" onclick="apagarMarca(${m.id},'${m.nome}')" style="color:var(--red);border-color:#fecaca;font-size:11px;height:26px">🗑</button>
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div id="marc-gestao-feedback" class="feedback hidden"></div>`;
}

function toggleGestaoMarcas() {
  marcGestaoExpandida = !marcGestaoExpandida;
  renderGestaoMarcas();
}

async function adicionarMarca() {
  const cod  = document.getElementById('nova-marc-cod').value.trim();
  const nome = document.getElementById('nova-marc-nome').value.trim().toUpperCase();
  if (!cod || !nome) { showFeedback('marc-gestao-feedback', 'Preencha o código e o nome.', true); return; }

  loading(true);
  const { error } = await sb.from('marcas').insert([{ empresa_id: currentEmpresaId, codigo: cod, nome }]);
  loading(false);

  if (error) { showFeedback('marc-gestao-feedback', 'Erro: ' + error.message, true); return; }
  showFeedback('marc-gestao-feedback', 'Marca adicionada.');
  await carregarListasFornMarca();
  await renderGestaoMarcas();
}

async function apagarMarca(id, nome) {
  if (!confirm(`Apagar marca "${nome}"?`)) return;
  loading(true);
  const { error } = await sb.from('marcas').delete().eq('id', id);
  loading(false);
  if (error) { alert('Erro: ' + error.message); return; }
  await carregarListasFornMarca();
  await renderGestaoMarcas();
}

// ── SUBTIPOS DE MARCA (ex: Michelin -> "XTRA LIFE") ────────────────

async function carregarListaSubtipos() {
  const { data } = await sb.from('subtipos_marca').select('*').order('nome');
  listaSubtipos = data || [];
  popularSelectorSubtipo('r-marca', 'r-subtipo');
  popularSelectorSubtipo('rr-marca', 'rr-subtipo');
}

// Popula o select de subtipos consoante a marca actualmente seleccionada no select de marca indicado
function popularSelectorSubtipo(selMarcaId, selSubtipoId) {
  const selMarca   = document.getElementById(selMarcaId);
  const selSubtipo = document.getElementById(selSubtipoId);
  if (!selMarca || !selSubtipo) return;

  const marca = listaMarcas.find(m => m.nome === selMarca.value);
  const opcoes = marca
    ? listaSubtipos.filter(s => s.marca_id === marca.id)
    : [];

  const val = selSubtipo.value;
  selSubtipo.innerHTML = '<option value="">— nenhum —</option>' +
    opcoes.map(s => `<option value="${s.nome}"${s.nome === val ? ' selected' : ''}>${s.nome}</option>`).join('');
}

async function abrirSubtipos(marcaId, marcaNome) {
  subtipoMarcaId = marcaId;
  document.getElementById('subtipos-marca-nome').textContent = marcaNome;
  document.getElementById('novo-subtipo-nome').value = '';
  document.getElementById('subtipos-feedback').classList.add('hidden');
  await renderListaSubtipos();
  document.getElementById('painel-subtipos').classList.add('open');
}

function fecharPainelSubtipos() {
  document.getElementById('painel-subtipos').classList.remove('open');
  subtipoMarcaId = null;
}

async function renderListaSubtipos() {
  if (subtipoMarcaId == null) return;
  loading(true);
  const { data } = await sb.from('subtipos_marca').select('*').eq('marca_id', subtipoMarcaId).order('nome');
  loading(false);

  const tbody = document.getElementById('subtipos-tbody');
  if (!tbody) return;
  tbody.innerHTML = (data && data.length > 0)
    ? data.map(s => `<tr>
        <td>${s.nome}</td>
        <td><button class="btn btn-sm" onclick="apagarSubtipo(${s.id})" style="color:var(--red);border-color:#fecaca;font-size:11px;height:26px">🗑</button></td>
      </tr>`).join('')
    : '<tr><td colspan="2" class="empty-msg" style="text-align:center;padding:10px">Ainda sem subtipos.</td></tr>';
}

async function adicionarSubtipo() {
  if (subtipoMarcaId == null) return;
  const nome = document.getElementById('novo-subtipo-nome').value.trim().toUpperCase();
  if (!nome) { showFeedback('subtipos-feedback', 'Indique o nome do subtipo.', true); return; }

  loading(true);
  const { error } = await sb.from('subtipos_marca').insert([{ empresa_id: currentEmpresaId, marca_id: subtipoMarcaId, nome }]);
  loading(false);

  if (error) { showFeedback('subtipos-feedback', 'Erro: ' + error.message, true); return; }
  showFeedback('subtipos-feedback', 'Subtipo adicionado.');
  document.getElementById('novo-subtipo-nome').value = '';
  await renderListaSubtipos();
  await carregarListaSubtipos();
}

async function apagarSubtipo(id) {
  if (!confirm('Apagar este subtipo?')) return;
  loading(true);
  const { error } = await sb.from('subtipos_marca').delete().eq('id', id);
  loading(false);
  if (error) { alert('Erro: ' + error.message); return; }
  await renderListaSubtipos();
  await carregarListaSubtipos();
}
