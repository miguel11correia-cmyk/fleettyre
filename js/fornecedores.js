// ── FORNECEDORES ──────────────────────────────────────────────────

let listaFornecedores = [];
let listaMarcas = [];

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
  // Selectores de veículos
  ['r-forn', 'rr-forn'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = el.value;
    el.innerHTML = '<option value="">— seleccionar —</option>' +
      listaFornecedores.map(f => `<option value="${f.nome}" ${f.nome === val ? 'selected' : ''}>${f.codigo} — ${f.nome}</option>`).join('');
  });

  ['r-marca', 'rr-marca'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = el.value;
    el.innerHTML = '<option value="">— seleccionar —</option>' +
      listaMarcas.map(m => `<option value="${m.nome}" ${m.nome === val ? 'selected' : ''}>${m.codigo} — ${m.nome}</option>`).join('');
  });
}

// ── PÁGINA FORNECEDORES ───────────────────────────────────────────

async function loadFornecedores() {
  loading(true);
  const { data, error } = await sb.from('pneus').select('*');
  loading(false);
  if (error || !data) return;

  // Renderizar gestão de fornecedores
  await renderGestaoFornecedores();

  // Analytics
  const agg = {};
  data.forEach(r => {
    const k = r.fornecedor || '(sem registo)';
    if (!agg[k]) agg[k] = { total: 0, novo: 0, remix: 0, piso: 0, comCusto: 0, custo: 0 };
    agg[k].total++;
    if (r.tipo === 'Novo')             agg[k].novo++;
    else if (r.tipo === 'Remix')       agg[k].remix++;
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
        <td>${f.total}</td><td>${f.novo}</td><td>${f.remix}</td><td>${f.piso}</td>
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
      COLORS.slice(0, keysComCusto.length)
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
      <button class="btn btn-p" onclick="adicionarFornecedor()" style="flex-shrink:0">+ Adicionar</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Código</th><th>Nome</th><th>Acção</th></tr></thead>
        <tbody>
          ${(data || []).map(f => `<tr>
            <td><strong>${f.codigo}</strong></td>
            <td>${f.nome}</td>
            <td><button class="btn btn-sm" onclick="apagarFornecedor(${f.id},'${f.nome}')" style="color:var(--red);border-color:#fecaca;font-size:11px;height:26px">🗑</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div id="forn-gestao-feedback" class="feedback hidden"></div>`;
}

async function adicionarFornecedor() {
  const cod  = document.getElementById('novo-forn-cod').value.trim();
  const nome = document.getElementById('novo-forn-nome').value.trim().toUpperCase();
  if (!cod || !nome) { showFeedback('forn-gestao-feedback', 'Preenche código e nome.', true); return; }

  loading(true);
  const { error } = await sb.from('fornecedores').insert([{ empresa_id: currentEmpresaId, codigo: cod, nome }]);
  loading(false);

  if (error) { showFeedback('forn-gestao-feedback', 'Erro: ' + error.message, true); return; }
  showFeedback('forn-gestao-feedback', 'Fornecedor adicionado.');
  await carregarListasFornMarca();
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
