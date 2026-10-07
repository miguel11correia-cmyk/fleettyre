// ── FORNECEDORES ──────────────────────────────────────────────────

let listaFornecedores = [];
let listaMarcas = [];
let fornGestaoExpandida = false;

// Carregar fornecedores e marcas para os selectores
async function carregarListasFornMarca() {
  const [resForn, resMarca] = await Promise.all([
    sb.from('fornecedores').select('*').order('codigo'),
    sb.from('marcas').select('*').order('codigo')
  ]);
  listaFornecedores = resForn.data || [];
  listaMarcas       = resMarca.data || [];
  preencherSelectores();
}

function preencherSelectores() {
  // Selectores de veículos e da fatura de stock
  ['r-forn', 'rr-forn', 'f-forn', 'e-forn', 're-forn', 'alo-forn'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = el.value;
    const placeholder = id === 'alo-forn' ? '— todos —' : '— selecionar —';
    // "PARQUE" é uma opção fixa da app (não um fornecedor registado) —
    // indica que o pneu já estava na frota antes de haver registo de
    // fornecedor, por isso aparece sempre, a cinzento, e não entra na
    // lista editável de fornecedores nem na análise (ver loadFornecedores).
    el.innerHTML = `<option value="">${placeholder}</option>` +
      `<option value="PARQUE" data-muted="true" ${val === 'PARQUE' ? 'selected' : ''}>Parque (já na frota)</option>` +
      listaFornecedores.map(f => `<option value="${f.nome}" ${f.nome === val ? 'selected' : ''}>${f.codigo} — ${f.nome}</option>`).join('');
  });

  ['r-marca', 'rr-marca', 'e-marca', 're-marca', 'alo-marca'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = el.value;
    const placeholder = id === 'alo-marca' ? '— todas —' : '— selecionar —';
    el.innerHTML = `<option value="">${placeholder}</option>` +
      listaMarcas.map(m => `<option value="${m.nome}" ${m.nome === val ? 'selected' : ''}>${m.codigo} — ${m.nome}</option>`).join('');
  });
}

// ── PÁGINA FORNECEDORES ───────────────────────────────────────────

async function loadFornecedores() {
  loading(true);
  const { data, error } = await sb.from('pneus').select('*');
  loading(false);
  if (error || !data) return;

  // Analytics
  const agg = {};
  data.forEach(r => {
    if (r.fornecedor === 'PARQUE') return; // não é um fornecedor real — pneu que a empresa já tinha antes
    const k = r.fornecedor || '(sem registo)';
    if (!agg[k]) agg[k] = { total: 0, novo: 0, remix: 0, rechapado: 0, piso: 0, comCusto: 0, custo: 0 };
    agg[k].total++;
    if (r.tipo === 'Novo')             agg[k].novo++;
    else if (r.tipo === 'Remix')       agg[k].remix++;
    else if (r.tipo === 'Rechapado')   agg[k].rechapado++;
    else if (r.tipo === 'Piso Aberto') agg[k].piso++;
    if (r.custo_pneu > 0) { agg[k].comCusto++; agg[k].custo += Number(r.custo_pneu); }
  });

  const keys = Object.keys(agg).sort((a, b) => agg[b].total - agg[a].total);
  const tbody = document.getElementById('forn-tbody');
  if (tbody) {
    tbody.innerHTML = keys.map(k => {
      const f   = agg[k];
      const med = f.comCusto > 0 ? fmtEur(f.custo / f.comCusto) : '—';
      return `<tr>
        <td><strong>${k}</strong></td>
        <td>${f.total}</td><td>${f.novo}</td><td>${f.remix}</td><td>${f.rechapado}</td><td>${f.piso}</td>
        <td>${f.comCusto}</td>
        <td style="text-align:right">${f.custo > 0 ? fmtEur(f.custo) : '—'}</td>
        <td style="text-align:right">${med}</td>
      </tr>`;
    }).join('');
  }

  const keysComCusto = keys.filter(k => agg[k].comCusto > 0);
  if (keysComCusto.length > 0) {
    mkChart('c-forn-custo', 'bar',
      keysComCusto,
      keysComCusto.map(k => Math.round(agg[k].custo / agg[k].comCusto)),
      CHART_NEUTRAL
    );
  }
}

async function renderGestaoFornecedores() {
  const { data } = await sb.from('fornecedores').select('*').order('codigo');
  const container = document.getElementById('gestao-fornecedores');
  if (!container) return;

  const proximoCodigo = data && data.length > 0
    ? String(Math.max(...data.map(f => parseInt(f.codigo))) + 1).padStart(2, '0')
    : '01';

  container.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px;align-items:flex-end">
      <div class="frow" style="margin:0;flex:0 0 80px">
        <label>Código</label>
        <input type="text" id="novo-forn-cod" value="${proximoCodigo}" style="width:80px" maxlength="3">
      </div>
      <div class="frow" style="margin:0;flex:1">
        <label>Nome do fornecedor</label>
        <input type="text" id="novo-forn-nome" placeholder="ex: JOSE LOURENCO" oninput="this.value=this.value.toUpperCase()">
      </div>
      <div class="frow" style="margin:0;flex:1">
        <label>Domínios/emails (opcional)</label>
        <input type="text" id="novo-forn-dominio" placeholder="ex: fornecedor.pt ou jose@gmail.com">
      </div>
      <button class="btn btn-p" onclick="adicionarFornecedor()" style="flex-shrink:0"><svg viewBox="0 0 24 24"><use href="#icon-plus"/></svg> Adicionar</button>
    </div>
    <div onclick="toggleGestaoFornecedores()" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;padding:6px 0;border-top:0.5px solid var(--border)">
      <span style="font-size:11px;color:var(--text2);font-weight:500">Lista de fornecedores (${(data || []).length})</span>
      <span style="font-size:11px;color:var(--text3)">${fornGestaoExpandida ? '▾ Recolher' : '▸ Expandir'}</span>
    </div>
    <div class="table-wrap${fornGestaoExpandida ? '' : ' hidden'}" style="margin-top:8px">
      <table>
        <thead><tr><th>Código</th><th>Nome</th><th>Domínios/emails <span style="font-weight:400;color:var(--text3)">(usa o email completo para gmail.com, outlook.pt, etc.)</span></th><th>Ação</th></tr></thead>
        <tbody>
          ${(data || []).map(f => `<tr>
            <td><strong>${f.codigo}</strong></td>
            <td>${f.nome}</td>
            <td>
              <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px">
                ${(f.dominios_email || []).map(d => `<span class="chip">${d}<button onclick="removerDominioFornecedor(${f.id}, '${d}')" title="Remover">×</button></span>`).join('')}
              </div>
              <input type="text" id="dom-input-${f.id}" placeholder="+ domínio ou email" style="height:24px;font-size:11px;padding:0 6px;border:0.5px solid var(--border2);border-radius:4px;width:170px" onkeydown="if(event.key==='Enter'){event.preventDefault();adicionarDominioFornecedor(${f.id})}">
            </td>
            <td><button class="btn btn-sm btn-icon btn-danger" onclick="apagarFornecedor(${f.id},'${f.nome}')" title="Apagar"><svg viewBox="0 0 24 24"><use href="#icon-trash"/></svg></button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div id="forn-gestao-feedback" class="feedback hidden"></div>`;
}

function toggleGestaoFornecedores() {
  fornGestaoExpandida = !fornGestaoExpandida;
  renderGestaoFornecedores();
}

// Separa por vírgula, tira espaços, baixa para minúsculas, ignora
// entradas vazias — devolve null (não array vazio) quando não sobra
// nada, para bater certo com o filtro (.not('dominios_email', 'is', null)).
function parseDominios(valor) {
  const lista = valor.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
  return lista.length > 0 ? lista : null;
}

async function adicionarFornecedor() {
  const cod     = document.getElementById('novo-forn-cod').value.trim();
  const nome    = document.getElementById('novo-forn-nome').value.trim().toUpperCase();
  const dominios = parseDominios(document.getElementById('novo-forn-dominio').value);
  if (!cod || !nome) { showFeedback('forn-gestao-feedback', 'Preencha o código e o nome.', true); return; }

  loading(true);
  const { error } = await sb.from('fornecedores').insert([{ empresa_id: currentEmpresaId, codigo: cod, nome, dominios_email: dominios }]);
  loading(false);

  if (error) { showFeedback('forn-gestao-feedback', 'Erro: ' + error.message, true); return; }
  showFeedback('forn-gestao-feedback', 'Fornecedor adicionado.');
  await carregarListasFornMarca();
  await renderGestaoFornecedores();
}

async function adicionarDominioFornecedor(id) {
  const input = document.getElementById(`dom-input-${id}`);
  const novo = input.value.trim().toLowerCase();
  if (!novo) return;

  const { data: atual } = await sb.from('fornecedores').select('dominios_email').eq('id', id).single();
  const atuais = atual?.dominios_email || [];
  if (atuais.includes(novo)) { input.value = ''; return; }

  const { error } = await sb.from('fornecedores').update({ dominios_email: [...atuais, novo] }).eq('id', id);
  if (error) { alert('Erro ao guardar o domínio: ' + error.message); return; }
  await renderGestaoFornecedores();
}

async function removerDominioFornecedor(id, dominio) {
  const { data: atual } = await sb.from('fornecedores').select('dominios_email').eq('id', id).single();
  const restantes = (atual?.dominios_email || []).filter(d => d !== dominio);

  const { error } = await sb.from('fornecedores').update({ dominios_email: restantes.length ? restantes : null }).eq('id', id);
  if (error) { alert('Erro ao remover o domínio: ' + error.message); return; }
  await renderGestaoFornecedores();
}

async function apagarFornecedor(id, nome) {
  if (!confirm(`Apagar fornecedor "${nome}"?`)) return;
  loading(true);
  const { error } = await sb.from('fornecedores').delete().eq('id', id);
  loading(false);
  if (error) { alert('Erro: ' + error.message); return; }
  await carregarListasFornMarca();
  await renderGestaoFornecedores();
}
