// ── COMPRAS (Fornecedores + Marcas) ──────────────────────────────────
// Página fundida (Camiões/Reboques/Visão unificada), já que um
// fornecedor ou uma marca são os mesmos independentemente de o pneu
// ir para camião ou reboque — mesmo raciocínio aplicado ao
// Início/Dashboard. A eficiência por marca (€/km em camiões, €/mês
// em reboques) não é combinável entre si, por isso só aparece nas
// vistas individuais, nunca na unificada — mesmo padrão usado na
// análise por posição/eixo do Início.

let comprasVista  = 'unificada'; // 'veiculos' | 'reboques' | 'unificada'
let fornDadosVeic = [];
let fornDadosReb  = [];
let fornCmpMarca  = '';

async function loadCompras(vistaInicial) {
  if (vistaInicial) comprasVista = vistaInicial;
  const sel = document.getElementById('compras-vista');
  if (sel) sel.value = comprasVista;

  loading(true);
  const [{ data: pneus }, { data: reboques }] = await Promise.all([
    fetchAllRows(() => sb.from('pneus').select('*').eq('empresa_id', currentEmpresaId).order('id')),
    fetchAllRows(() => sb.from('reboques').select('*').eq('empresa_id', currentEmpresaId).order('id')),
  ]);
  loading(false);

  fornDadosVeic = pneus || [];
  fornDadosReb  = reboques || [];

  renderComprasVista();
}

function escolherVistaCompras(v) {
  comprasVista = v;
  renderComprasVista();
}

function dadosComprasVista() {
  if (comprasVista === 'veiculos') return fornDadosVeic;
  if (comprasVista === 'reboques') return fornDadosReb;
  return [...fornDadosVeic, ...fornDadosReb];
}

function renderComprasVista() {
  renderComparacaoFornecedores();
  renderDesempenhoMarcas();
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

  const dados  = dadosComprasVista();
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

// ── DESEMPENHO POR MARCA ──────────────────────────────────────────────
// Na vista unificada mostra só contagens e custo, combináveis entre
// camiões e reboques. Nas vistas individuais acrescenta a eficiência
// (€/km nos camiões, via odómetro; €/mês nos reboques, via duração —
// não há odómetro de reboque) e o ranking por essa eficiência.

// Só entram registos desmontados com toda a informação necessária —
// um pneu ainda montado não tem KMs/duração "final", por isso
// qualquer média com ele misturado seria uma estimativa a menos, não
// um valor real fechado.
function registosCompletosVeiculos() {
  return fornDadosVeic.filter(r =>
    r.marca && r.mes_desmont && r.kms_mont != null && r.kms_desmont != null &&
    r.kms_desmont > r.kms_mont && r.custo_pneu > 0
  );
}

function registosCompletosReboques() {
  return fornDadosReb.filter(r =>
    r.marca && r.mes_mont && r.mes_desmont && r.custo_pneu > 0
  );
}

function renderDesempenhoMarcas() {
  const thead = document.getElementById('marc-thead');
  const tbody = document.getElementById('marc-tbody');
  if (!thead || !tbody) return;

  if (comprasVista === 'veiculos') {
    renderDesempenhoMarcasDetalhe(thead, tbody, registosCompletosVeiculos(), 'km');
  } else if (comprasVista === 'reboques') {
    renderDesempenhoMarcasDetalhe(thead, tbody, registosCompletosReboques(), 'mes');
  } else {
    renderDesempenhoMarcasDetalhe(thead, tbody, [...registosCompletosVeiculos(), ...registosCompletosReboques()], null);
  }
}

// Detalhe por Marca → Modelo (subtipo) → Tipo, com custo médio e,
// nas vistas individuais, a eficiência (€/1000km nos camiões, via
// odómetro; €/mês nos reboques, via duração — não combinável entre
// si, por isso ausente na vista unificada).
function renderDesempenhoMarcasDetalhe(thead, tbody, dados, modo) {
  const agg = {};
  dados.forEach(r => {
    const chave = r.marca + '|||' + (r.subtipo || '(sem modelo)') + '|||' + (r.tipo || '(sem tipo)');
    if (!agg[chave]) agg[chave] = { marca: r.marca, modelo: r.subtipo || '(sem modelo)', tipo: r.tipo || '—', custos: [], efArr: [] };
    agg[chave].custos.push(Number(r.custo_pneu));
    if (modo === 'km') {
      const km = r.kms_desmont - r.kms_mont;
      if (km > 0) agg[chave].efArr.push(Number(r.custo_pneu) / (km / 1000));
    } else if (modo === 'mes') {
      const meses = mesesEntre(r.mes_mont, r.mes_desmont);
      if (meses > 0) agg[chave].efArr.push(Number(r.custo_pneu) / meses);
    }
  });

  const linhas = Object.values(agg).map(g => ({
    ...g,
    n: g.custos.length,
    custoM: g.custos.reduce((s, v) => s + v, 0) / g.custos.length,
    efM: g.efArr.length > 0 ? g.efArr.reduce((s, v) => s + v, 0) / g.efArr.length : null,
  }));

  if (modo) {
    // Ranking: combinações com eficiência calculável primeiro (mais
    // barata/eficiente primeiro), as restantes no fim por nº de registos.
    linhas.sort((a, b) => {
      if (a.efM != null && b.efM != null) return a.efM - b.efM;
      if (a.efM != null) return -1;
      if (b.efM != null) return 1;
      return b.n - a.n;
    });
  } else {
    linhas.sort((a, b) => b.n - a.n);
  }

  const efLabel = modo === 'km' ? '€/1000km' : modo === 'mes' ? '€/mês' : null;
  thead.innerHTML = `<tr>
    ${modo ? '<th>#</th>' : ''}
    <th>Marca</th><th>Modelo</th><th>Tipo</th>
    <th style="text-align:center">Nº registos</th><th style="text-align:right">Custo médio (€)</th>
    ${efLabel ? `<th style="text-align:right">${efLabel}</th>` : ''}
  </tr>`;

  tbody.innerHTML = linhas.length === 0
    ? `<tr><td colspan="${modo ? 6 : 5}" class="empty-msg" style="text-align:center;padding:12px">Sem registos desmontados com toda a informação necessária ainda.</td></tr>`
    : linhas.map((l, i) => `<tr>
        ${modo ? `<td>${l.efM != null ? i + 1 : '—'}</td>` : ''}
        <td><strong>${l.marca}</strong></td>
        <td>${l.modelo}</td>
        <td>${l.tipo}</td>
        <td style="text-align:center">${l.n}</td>
        <td style="text-align:right">${fmtEur(l.custoM)}</td>
        ${efLabel ? `<td style="text-align:right">${l.efM != null ? fmtEur(l.efM) : '—'}</td>` : ''}
      </tr>`).join('');
}

// ── GESTÃO (Configuração > Fornecedores) ─────────────────────────────

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
    // lista editável de fornecedores nem na análise (ver renderComparacaoFornecedores).
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
