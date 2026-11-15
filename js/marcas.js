// ── MARCAS ────────────────────────────────────────────────────────
// A analise de desempenho por marca fundiu-se com a de Fornecedores
// na pagina "Compras" — ver renderDesempenhoMarcas() em
// js/compras.js. Este ficheiro fica só com a gestão (Configuração >
// Marcas): lista de marcas e os seus subtipos/modelos.

let marcGestaoExpandida = false;
let listaSubtipos       = [];
let subtipoMarcaId      = null;

async function renderGestaoMarcas() {
  const { data } = await sb.from('marcas').select('*').eq('empresa_id', currentEmpresaId).order('codigo');
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
      <button class="btn btn-p" onclick="adicionarMarca()" style="flex-shrink:0"><svg viewBox="0 0 24 24"><use href="#icon-plus"/></svg> Adicionar</button>
    </div>
    <div onclick="toggleGestaoMarcas()" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;padding:6px 0;border-top:0.5px solid var(--border)">
      <span style="font-size:11px;color:var(--text2);font-weight:500">Lista de marcas (${(data || []).length})</span>
      <span style="font-size:11px;color:var(--text3)">${marcGestaoExpandida ? '▾ Recolher' : '▸ Expandir'}</span>
    </div>
    <div class="table-wrap${marcGestaoExpandida ? '' : ' hidden'}" style="margin-top:8px">
      <table>
        <thead><tr><th>Código</th><th>Nome</th><th>Ação</th></tr></thead>
        <tbody>
          ${(data || []).map(m => `<tr>
            <td><strong>${m.codigo}</strong></td>
            <td>${m.nome}</td>
            <td>
              <div style="display:flex;gap:4px">
                <button class="btn btn-sm" onclick="abrirSubtipos(${m.id},'${m.nome}')"><svg viewBox="0 0 24 24"><use href="#icon-tag"/></svg> Modelos</button>
                <button class="btn btn-sm btn-icon btn-danger" onclick="apagarMarca(${m.id},'${m.nome}')" title="Apagar"><svg viewBox="0 0 24 24"><use href="#icon-trash"/></svg></button>
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
  const { data } = await sb.from('subtipos_marca').select('*').eq('empresa_id', currentEmpresaId).order('nome');
  listaSubtipos = data || [];
  popularSelectorSubtipo('g-marca', 'g-subtipo');
}

// Popula o select de subtipos consoante a marca atualmente selecionada no select de marca indicado
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
  document.getElementById('novo-subtipo-posicao').value = '';
  document.getElementById('novo-subtipo-descricao').value = '';
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
  const { data } = await sb.from('subtipos_marca').select('*').eq('marca_id', subtipoMarcaId).eq('empresa_id', currentEmpresaId).order('nome');
  loading(false);

  const tbody = document.getElementById('subtipos-tbody');
  if (!tbody) return;
  tbody.innerHTML = (data && data.length > 0)
    ? data.map(s => `<tr>
        <td>${s.nome}</td>
        <td>${s.posicao || '—'}</td>
        <td>${s.descricao || '—'}</td>
        <td><button class="btn btn-sm btn-icon btn-danger" onclick="apagarSubtipo(${s.id})" title="Apagar"><svg viewBox="0 0 24 24"><use href="#icon-trash"/></svg></button></td>
      </tr>`).join('')
    : '<tr><td colspan="4" class="empty-msg" style="text-align:center;padding:10px">Ainda sem modelos.</td></tr>';
}

async function adicionarSubtipo() {
  if (subtipoMarcaId == null) return;
  const nome = document.getElementById('novo-subtipo-nome').value.trim().toUpperCase();
  const posicao = document.getElementById('novo-subtipo-posicao').value || null;
  const descricao = document.getElementById('novo-subtipo-descricao').value.trim() || null;
  if (!nome) { showFeedback('subtipos-feedback', 'Indique o nome do modelo.', true); return; }

  loading(true);
  const { error } = await sb.from('subtipos_marca').insert([{ empresa_id: currentEmpresaId, marca_id: subtipoMarcaId, nome, posicao, descricao }]);
  loading(false);

  if (error) { showFeedback('subtipos-feedback', 'Erro: ' + error.message, true); return; }
  showFeedback('subtipos-feedback', 'Modelo adicionado.');
  document.getElementById('novo-subtipo-nome').value = '';
  document.getElementById('novo-subtipo-posicao').value = '';
  document.getElementById('novo-subtipo-descricao').value = '';
  await renderListaSubtipos();
  await carregarListaSubtipos();
}

async function apagarSubtipo(id) {
  if (!confirm('Apagar este modelo?')) return;
  loading(true);
  const { error } = await sb.from('subtipos_marca').delete().eq('id', id);
  loading(false);
  if (error) { alert('Erro: ' + error.message); return; }
  await renderListaSubtipos();
  await carregarListaSubtipos();
}
