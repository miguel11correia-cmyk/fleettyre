// ── FORNECEDORES ──────────────────────────────────────────────────

let listaFornecedores = [];
let listaMarcas = [];
let fornGestaoExpandida = false;

// Carregar fornecedores e marcas para os selectores
async function carregarListasFornMarca() {
  const [resForn, resMarca] = await Promise.all([
    sb.from('fornecedores').select('*').eq('empresa_id', currentEmpresaId).order('codigo'),
    sb.from('marcas').select('*').eq('empresa_id', currentEmpresaId).order('codigo')
  ]);
  listaFornecedores = resForn.data || [];
  listaMarcas       = resMarca.data || [];
  preencherSelectores();
}

function preencherSelectores() {
  // Selectores de veículos e da fatura de stock
  ['g-forn', 'f-forn', 'e-forn', 're-forn', 'alo-forn'].forEach(id => {
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
      listaFornecedores.map(f => `<option value="${f.nome}" ${f.nome === val ? 'selected' : ''}>${f.codigo} · ${f.nome}</option>`).join('');
  });

  ['g-marca', 'e-marca', 're-marca', 'alo-marca'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = el.value;
    const placeholder = id === 'alo-marca' ? '— todas —' : '— selecionar —';
    el.innerHTML = `<option value="">${placeholder}</option>` +
      listaMarcas.map(m => `<option value="${m.nome}" ${m.nome === val ? 'selected' : ''}>${m.codigo} · ${m.nome}</option>`).join('');
  });
}

// ── PÁGINA FORNECEDORES ───────────────────────────────────────────
// Fundida (Camiões/Reboques/Unificada), já que o fornecedor é o
// mesmo independentemente do pneu ir para camião ou reboque — ver
// o mesmo raciocínio aplicado ao Início/Dashboard.

let fornVista     = 'unificada'; // 'veiculos' | 'reboques' | 'unificada'
let fornDadosVeic = [];
let fornDadosReb  = [];
let fornCmpMarca  = '';

async function loadFornecedores(vistaInicial) {
  if (vistaInicial) fornVista = vistaInicial;
  const sel = document.getElementById('forn-vista');
  if (sel) sel.value = fornVista;

  loading(true);
  const [{ data: pneus }, { data: reboques }] = await Promise.all([
    fetchAllRows(() => sb.from('pneus').select('*').eq('empresa_id', currentEmpresaId).order('id')),
    fetchAllRows(() => sb.from('reboques').select('*').eq('empresa_id', currentEmpresaId).order('id')),
  ]);
  loading(false);

  fornDadosVeic = pneus || [];
  fornDadosReb  = reboques || [];
  renderFornecedoresVista();
}

function escolherVistaFornecedores(v) {
  fornVista = v;
  renderFornecedoresVista();
}

function dadosFornecedoresVista() {
  if (fornVista === 'veiculos') return fornDadosVeic;
  if (fornVista === 'reboques') return fornDadosReb;
  return [...fornDadosVeic, ...fornDadosReb];
}

function renderFornecedoresVista() {
  const dados = dadosFornecedoresVista();

  const agg = {};
  dados.forEach(r => {
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

  renderComparacaoFornecedores();
}

// ── COMPARAÇÃO DE PREÇOS POR MARCA E MODELO ─────────────────────────
// Por modelo (subtipo) da marca escolhida, ordena os fornecedores do
// mais barato ao mais caro. A percentagem compara sempre contra o
// fornecedor mais barato NESSE MOMENTO, não contra uma média de todo
// o histórico — uma média destas desloca-se para baixo à medida que
// se compra mais ao fornecedor mais barato, o que tornaria a
// percentagem cada vez menos informativa com o tempo.

function escolherMarcaComparacaoFornecedores(v) {
  fornCmpMarca = v;
  renderComparacaoFornecedores();
}

function renderComparacaoFornecedores() {
  const sel = document.getElementById('forn-cmp-marca');
  const cont = document.getElementById('forn-cmp-resultado');
  if (!sel || !cont) return;

  const dados  = dadosFornecedoresVista();
  const marcas = [...new Set(dados.filter(r => r.marca).map(r => r.marca))].sort();
  const val = fornCmpMarca;
  sel.innerHTML = '<option value="">— selecionar —</option>' +
    marcas.map(m => `<option value="${m}"${m === val ? ' selected' : ''}>${m}</option>`).join('');

  if (!fornCmpMarca) {
    cont.innerHTML = '<p class="empty-msg">Escolhe uma marca para comparar preços entre fornecedores.</p>';
    return;
  }

  const doMarca = dados.filter(r =>
    r.marca === fornCmpMarca && r.fornecedor && r.fornecedor !== 'PARQUE' && r.custo_pneu > 0
  );
  if (doMarca.length === 0) {
    cont.innerHTML = '<p class="empty-msg">Sem registos com custo registado para esta marca.</p>';
    return;
  }

  const porSubtipo = {};
  doMarca.forEach(r => {
    const sub = r.subtipo || '(sem modelo registado)';
    if (!porSubtipo[sub]) porSubtipo[sub] = {};
    if (!porSubtipo[sub][r.fornecedor]) porSubtipo[sub][r.fornecedor] = [];
    porSubtipo[sub][r.fornecedor].push(Number(r.custo_pneu));
  });

  const subtipos = Object.keys(porSubtipo).sort();
  cont.innerHTML = subtipos.map(sub => {
    const linhas = Object.keys(porSubtipo[sub])
      .map(f => {
        const custos = porSubtipo[sub][f];
        const media  = custos.reduce((s, v) => s + v, 0) / custos.length;
        return { fornecedor: f, media, n: custos.length };
      })
      .sort((a, b) => a.media - b.media);

    const min = linhas[0].media;
    const linhasHtml = linhas.map(l => {
      const pct = min > 0 ? Math.round(((l.media - min) / min) * 100) : 0;
      const pctHtml = pct === 0
        ? '<span style="color:var(--green);font-size:11px;font-weight:600">mais barato</span>'
        : `<span style="color:var(--red);font-size:11px;font-weight:600">+${pct}%</span>`;
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:0.5px solid var(--border)">
        <span>${l.fornecedor} <span style="color:var(--text3);font-size:11px">(${l.n} ${l.n === 1 ? 'compra' : 'compras'})</span></span>
        <span style="display:flex;gap:10px;align-items:center">
          <strong>${fmtEur(l.media)}</strong>
          ${pctHtml}
        </span>
      </div>`;
    }).join('');

    return `<div style="margin-top:14px">
      <div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:2px">${sub}</div>
      ${linhasHtml}
    </div>`;
  }).join('');
}

async function renderGestaoFornecedores() {
  const { data } = await sb.from('fornecedores').select('*').eq('empresa_id', currentEmpresaId).order('codigo');
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

  const { data: atual } = await sb.from('fornecedores').select('dominios_email').eq('id', id).eq('empresa_id', currentEmpresaId).single();
  const atuais = atual?.dominios_email || [];
  if (atuais.includes(novo)) { input.value = ''; return; }

  const { error } = await sb.from('fornecedores').update({ dominios_email: [...atuais, novo] }).eq('id', id);
  if (error) { alert('Erro ao guardar o domínio: ' + error.message); return; }
  await renderGestaoFornecedores();
}

async function removerDominioFornecedor(id, dominio) {
  const { data: atual } = await sb.from('fornecedores').select('dominios_email').eq('id', id).eq('empresa_id', currentEmpresaId).single();
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
