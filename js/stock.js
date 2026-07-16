// ── STOCK.JS ─────────────────────────────────────────────────────
// stockLinhaSelId, stockDesmontadoSelId declarados em config.js

let linhasFatura  = [];
let stockContexto = 'veiculos'; // definido pelo nav antes de loadStock()

// ── CARREGAR STOCK ────────────────────────────────────────────────

async function loadStock() {
  loading(true);

  const tabela = stockContexto === 'reboques' ? 'reboques' : 'pneus';

  const [resFaturas, resDesmontados] = await Promise.all([
    sb.from('stock_faturas')
      .select('*, stock_linhas(*)')
      .eq('contexto', stockContexto)
      .order('created_at', { ascending: false }),
    sb.from(tabela)
      .select('*')
      .in('destino', ['Abrir Piso', 'Stock', 'Rechapar'])
      .not('mes_desmont', 'is', null)
      .eq('remontado', false)
      .order('mes_desmont', { ascending: false })
  ]);

  loading(false);

  const faturas     = resFaturas.data     || [];
  const desmontados = resDesmontados.data || [];

  // KPIs
  const faturasAtivas = faturas.filter(f =>
    f.stock_linhas && f.stock_linhas.some(l => l.quantidade_disp > 0)
  );
  let totalPneus = 0, totalValor = 0;
  faturasAtivas.forEach(f => {
    f.stock_linhas.filter(l => l.quantidade_disp > 0).forEach(l => {
      totalPneus += l.quantidade_disp;
      totalValor += l.quantidade_disp * (l.preco_unitario || 0);
    });
  });

  document.getElementById('sk-faturas').textContent = faturasAtivas.length;
  document.getElementById('sk-pneus').textContent   = totalPneus + desmontados.length;
  document.getElementById('sk-valor').textContent   = totalValor > 0 ? fmtEur(totalValor) : '—';
  const skD = document.getElementById('sk-desmont');
  if (skD) skD.textContent = desmontados.length;

  // Pneus desmontados
  renderStockDesmontados(desmontados, tabela);

  // Faturas
  const container = document.getElementById('stock-faturas-container');
  if (faturasAtivas.length === 0) {
    container.innerHTML = '<div class="card"><p class="empty-msg">Sem faturas com stock disponível. Clica em "+ Nova fatura" para registar.</p></div>';
    return;
  }

  let html = '';
  faturasAtivas.forEach(f => {
    const linhasDisp = f.stock_linhas.filter(l => l.quantidade_disp > 0);
    const totalFat   = linhasDisp.reduce((s, l) => s + l.quantidade_disp * (l.preco_unitario || 0), 0);
    const fId        = f.id;

    let linhasHTML = '';
    linhasDisp.forEach(l => {
      const pct = Math.round((l.quantidade_disp / l.quantidade_ini) * 100);
      const cor = pct <= 25 ? '#c93030' : pct <= 50 ? '#c47b0a' : '#1baf7a';
      linhasHTML += '<tr>'
        + '<td>' + (l.marca || '—') + '</td>'
        + '<td>' + (l.medida || '—') + '</td>'
        + '<td>' + tipoBadge(l.tipo) + '</td>'
        + '<td style="text-align:center"><span style="color:' + cor + ';font-weight:500">' + l.quantidade_disp + '</span><span style="color:var(--text3)"> / ' + l.quantidade_ini + '</span></td>'
        + '<td style="text-align:right">' + (l.preco_unitario ? fmtEur(l.preco_unitario) : '—') + '</td>'
        + '<td style="text-align:right">' + (l.preco_unitario ? fmtEur(l.quantidade_disp * l.preco_unitario) : '—') + '</td>'
        + '</tr>';
    });

    html += '<div class="card" style="margin-bottom:14px">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">';
    html += '<div>';
    html += '<span style="font-size:14px;font-weight:500">📄 ' + f.num_fatura + '</span>';
    html += '<span style="color:var(--text2);font-size:12px;margin-left:10px">' + f.fornecedor + '</span>';
    if (f.data_fatura) html += '<span style="color:var(--text3);font-size:11px;margin-left:8px">' + f.data_fatura + '</span>';
    html += '</div>';
    html += '<div style="display:flex;align-items:center;gap:10px">';
    html += '<span style="font-size:12px;font-weight:500;color:var(--amber)">' + fmtEur(totalFat) + ' em stock</span>';
    html += '<button class="btn btn-sm" onclick="apagarFatura(' + fId + ')" style="height:26px;padding:0 8px;font-size:11px;color:var(--red);border-color:#f5c6c6">🗑 Apagar</button>';
    html += '</div></div>';
    if (f.notas) html += '<p style="font-size:11px;color:var(--text3);margin-bottom:10px;font-style:italic">' + f.notas + '</p>';
    html += '<div class="table-wrap"><table>';
    html += '<thead><tr><th>Marca</th><th>Medida</th><th>Tipo</th><th style="text-align:center">Disponível / Total</th><th style="text-align:right">Preço unit. (€)</th><th style="text-align:right">Valor disp. (€)</th></tr></thead>';
    html += '<tbody>' + linhasHTML + '</tbody></table></div></div>';
  });

  container.innerHTML = html;
}

function renderStockDesmontados(pneus, tabela) {
  const container = document.getElementById('stock-desmontados-container');
  if (!container) return;
  if (pneus.length === 0) {
    container.innerHTML = '<p class="empty-msg">Nenhum pneu desmontado em armazém neste contexto.</p>';
    return;
  }

  let html = '<div class="table-wrap"><table>';
  html += '<thead><tr><th>Matrícula</th><th>Mês desmont.</th><th>Posição</th><th>Marca</th><th>Medida</th><th>Tipo</th><th>Escultura</th><th>Destino</th><th>Duração</th></tr></thead><tbody>';
  pneus.forEach(r => {
    const duracao = tabela === 'pneus'
      ? (r.kms_desmont && r.kms_mont ? fmt(r.kms_desmont - r.kms_mont) + ' km' : '—')
      : (r.mes_desmont && r.mes_mont ? mesesEntre(r.mes_mont, r.mes_desmont) + ' meses' : '—');
    const escStr  = r.escultura_final != null ? r.escultura_final + '\u202fmm' : '—';
    const destCls = r.destino === 'Abrir Piso' ? 'b-piso' : r.destino === 'Rechapar' ? 'b-rechapado' : 'b-remix';
    html += '<tr>'
      + '<td><strong>' + r.matricula + '</strong></td>'
      + '<td>' + (r.mes_desmont || '—') + '</td>'
      + '<td>' + (r.posicao || '—') + '</td>'
      + '<td>' + (r.marca || '—') + '</td>'
      + '<td>' + (r.medida || '—') + '</td>'
      + '<td>' + tipoBadge(r.tipo) + '</td>'
      + '<td>' + escStr + '</td>'
      + '<td><span class="badge ' + destCls + '">' + r.destino + '</span></td>'
      + '<td>' + duracao + '</td>'
      + '</tr>';
  });
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

// ── NOVA FATURA ───────────────────────────────────────────────────

function abrirNovaFatura() {
  linhasFatura = [];
  ['f-num','f-forn','f-data','f-notas'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const fb = document.getElementById('f-feedback');
  if (fb) fb.classList.add('hidden');
  renderLinhasFatura();
  document.getElementById('painel-fatura').classList.add('open');
}

function fecharPainelFatura() {
  document.getElementById('painel-fatura').classList.remove('open');
}

function adicionarLinhaFatura() {
  linhasFatura.push({ marca: '', medida: '', tipo: 'Novo', quantidade: '', preco: '' });
  renderLinhasFatura();
}

function removerLinhaFatura(idx) {
  linhasFatura.splice(idx, 1);
  renderLinhasFatura();
}

function renderLinhasFatura() {
  const container = document.getElementById('f-linhas');
  if (!container) return;
  if (linhasFatura.length === 0) {
    container.innerHTML = '<p style="font-size:12px;color:var(--text3);text-align:center;padding:8px">Clica "+ Linha" para adicionar pneus.</p>';
    return;
  }
  let html = '';
  linhasFatura.forEach((l, i) => {
    html += '<div style="border:0.5px solid var(--border);border-radius:var(--radius);padding:10px;margin-bottom:8px;background:var(--bg)">'
      + '<div style="display:flex;justify-content:space-between;margin-bottom:8px">'
      + '<span style="font-size:11px;font-weight:500;color:var(--text2)">Linha ' + (i+1) + '</span>'
      + '<button class="btn-close" onclick="removerLinhaFatura(' + i + ')">✕</button>'
      + '</div>'
      + '<div class="g3" style="gap:8px;margin-bottom:8px">'
      + '<div class="frow" style="margin:0"><label>Marca</label><input type="text" value="' + l.marca + '" oninput="linhasFatura[' + i + '].marca=this.value.toUpperCase();this.value=this.value.toUpperCase()" placeholder="MICHELIN"></div>'
      + '<div class="frow" style="margin:0"><label>Medida</label><input type="text" value="' + l.medida + '" oninput="linhasFatura[' + i + '].medida=this.value" placeholder="315/80"></div>'
      + '<div class="frow" style="margin:0"><label>Tipo</label><select onchange="linhasFatura[' + i + '].tipo=this.value"><option ' + (l.tipo==='Novo'?'selected':'') + '>Novo</option><option ' + (l.tipo==='Remix'?'selected':'') + '>Remix</option><option ' + (l.tipo==='Rechapado'?'selected':'') + '>Rechapado</option><option ' + (l.tipo==='Piso Aberto'?'selected':'') + '>Piso Aberto</option></select></div>'
      + '</div>'
      + '<div class="g2" style="gap:8px">'
      + '<div class="frow" style="margin:0"><label>Quantidade *</label><input type="number" value="' + l.quantidade + '" oninput="linhasFatura[' + i + '].quantidade=this.value" placeholder="ex: 4" min="1"></div>'
      + '<div class="frow" style="margin:0"><label>Preço unit. (€)</label><input type="number" value="' + l.preco + '" oninput="linhasFatura[' + i + '].preco=this.value" placeholder="ex: 320" min="0" step="0.01"></div>'
      + '</div></div>';
  });
  container.innerHTML = html;
}

async function guardarFatura() {
  const numFat = document.getElementById('f-num').value.trim().toUpperCase();
  const forn   = document.getElementById('f-forn').value.trim().toUpperCase();
  const data   = document.getElementById('f-data').value.trim() || null;
  const notas  = document.getElementById('f-notas').value.trim() || null;

  if (!numFat) { showFeedback('f-feedback', 'Nº de fatura é obrigatório.', true); return; }
  if (!forn)   { showFeedback('f-feedback', 'Fornecedor é obrigatório.', true); return; }
  if (linhasFatura.length === 0) { showFeedback('f-feedback', 'Adiciona pelo menos um pneu.', true); return; }
  for (let i = 0; i < linhasFatura.length; i++) {
    if (!parseInt(linhasFatura[i].quantidade) || parseInt(linhasFatura[i].quantidade) <= 0) {
      showFeedback('f-feedback', 'Linha ' + (i+1) + ': quantidade inválida.', true); return;
    }
  }

  loading(true);
  const { data: faturaData, error: errF } = await sb
    .from('stock_faturas')
    .insert([{ empresa_id: currentEmpresaId, num_fatura: numFat, fornecedor: forn, data_fatura: data, notas, contexto: stockContexto }])
    .select().single();

  if (errF) { loading(false); showFeedback('f-feedback', 'Erro: ' + errF.message, true); return; }

  const linhasInsert = linhasFatura.map(l => ({
    fatura_id:       faturaData.id,
    marca:           l.marca   || null,
    medida:          l.medida  || null,
    tipo:            l.tipo    || 'Novo',
    quantidade_ini:  parseInt(l.quantidade),
    quantidade_disp: parseInt(l.quantidade),
    preco_unitario:  l.preco ? parseFloat(l.preco) : null,
  }));

  const { error: errL } = await sb.from('stock_linhas').insert(linhasInsert);
  loading(false);
  if (errL) { showFeedback('f-feedback', 'Erro nas linhas: ' + errL.message, true); return; }

  showFeedback('f-feedback', 'Fatura guardada com sucesso.');
  linhasFatura = [];
  setTimeout(() => { fecharPainelFatura(); loadStock(); }, 800);
}

async function apagarFatura(id) {
  if (!confirm('Tens a certeza que queres apagar esta fatura e todos os pneus associados?')) return;
  loading(true);
  const { error } = await sb.from('stock_faturas').delete().eq('id', id);
  loading(false);
  if (error) { alert('Erro ao apagar: ' + error.message); return; }
  loadStock();
}

// ── SELECCIONAR DE STOCK ──────────────────────────────────────────

async function abrirSelStock() {
  loading(true);

  // Buscar de AMBOS os contextos — pneus circulam entre veículos e reboques
  const [resV, resR, resDV, resDR] = await Promise.all([
    sb.from('stock_faturas').select('*, stock_linhas(*)').eq('contexto','veiculos').order('created_at',{ascending:false}),
    sb.from('stock_faturas').select('*, stock_linhas(*)').eq('contexto','reboques').order('created_at',{ascending:false}),
    sb.from('pneus').select('*').in('destino',['Abrir Piso','Stock','Rechapar']).not('mes_desmont','is',null).eq('remontado',false),
    sb.from('reboques').select('*').in('destino',['Abrir Piso','Stock','Rechapar']).not('mes_desmont','is',null).eq('remontado',false),
  ]);

  loading(false);

  const faturasV    = resV.data  || [];
  const faturasR    = resR.data  || [];
  const desmontadosV = resDV.data || [];
  const desmontadosR = resDR.data || [];

  const todasFaturas = [...faturasV, ...faturasR];
  const linhasDisp = [];
  todasFaturas.forEach(f => {
    (f.stock_linhas || []).filter(l => l.quantidade_disp > 0).forEach(l => {
      linhasDisp.push({ ...l, num_fatura: f.num_fatura, fornecedor: f.fornecedor, contexto: f.contexto });
    });
  });

  const todosDesmont = [
    ...desmontadosV.map(r => ({ ...r, _tabela: 'pneus' })),
    ...desmontadosR.map(r => ({ ...r, _tabela: 'reboques' }))
  ];

  const lista = document.getElementById('stock-sel-lista');
  let html = '';

  if (linhasDisp.length === 0 && todosDesmont.length === 0) {
    html = '<p class="empty-msg">Sem stock disponível.</p>';
  } else {
    if (linhasDisp.length > 0) {
      html += '<div style="font-size:10px;font-weight:500;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">📄 De faturas</div>';
      linhasDisp.forEach(l => {
        const ctx = l.contexto === 'reboques' ? ' · Reboque' : ' · Veículo';
        const lId = l.id;
        const lMarca = (l.marca || '').replace(/'/g, "\\'");
        const lMedida = (l.medida || '').replace(/'/g, "\\'");
        const lTipo = l.tipo || '';
        const lForn = (l.fornecedor || '').replace(/'/g, "\\'");
        const lPreco = l.preco_unitario || 0;
        html += '<div style="border:0.5px solid var(--border);border-radius:var(--radius);padding:10px;margin-bottom:8px;cursor:pointer" onclick="selecionarDeStock(' + lId + ',\'' + lMarca + '\',\'' + lMedida + '\',\'' + lTipo + '\',\'' + lForn + '\',' + lPreco + ')">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center">';
        html += '<div><span style="font-weight:500;font-size:13px">' + (l.marca||'—') + ' ' + (l.medida||'') + '</span><span style="margin-left:8px">' + tipoBadge(l.tipo) + '</span></div>';
        html += '<span style="color:var(--amber);font-weight:500">' + (l.preco_unitario ? fmtEur(l.preco_unitario) : '—') + '</span>';
        html += '</div>';
        html += '<div style="font-size:11px;color:var(--text2);margin-top:4px">📄 ' + l.num_fatura + ' · ' + l.fornecedor + ctx + ' · <span style="color:var(--green);font-weight:500">' + l.quantidade_disp + ' disponíveis</span></div>';
        html += '</div>';
      });
    }

    if (todosDesmont.length > 0) {
      html += '<div style="font-size:10px;font-weight:500;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin:12px 0 8px">🔧 Desmontados em armazém</div>';
      todosDesmont.forEach(r => {
        const origem = r._tabela === 'reboques' ? '🔗 Reboque' : '🚛 Veículo';
        const rId = r.id;
        const rMarca = (r.marca || '').replace(/'/g, "\\'");
        const rMedida = (r.medida || '').replace(/'/g, "\\'");
        const rTipo = r.tipo || '';
        const rMat = r.matricula.replace(/'/g, "\\'");
        const rTab = r._tabela;
        html += '<div style="border:0.5px solid var(--border);border-radius:var(--radius);padding:10px;margin-bottom:8px;cursor:pointer" onclick="selecionarDesmontadoDeStock(' + rId + ',\'' + rMarca + '\',\'' + rMedida + '\',\'' + rTipo + '\',\'' + rMat + '\',\'' + rTab + '\')">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center">';
        html += '<div><span style="font-weight:500;font-size:13px">' + (r.marca||'—') + ' ' + (r.medida||'') + '</span><span style="margin-left:8px">' + tipoBadge(r.tipo) + '</span></div>';
        const rDestCls = r.destino === 'Abrir Piso' ? 'b-piso' : r.destino === 'Rechapar' ? 'b-rechapado' : 'b-remix';
        html += '<span class="badge ' + rDestCls + '">' + r.destino + '</span>';
        html += '</div>';
        html += '<div style="font-size:11px;color:var(--text2);margin-top:4px">' + origem + ' ' + r.matricula + ' · ' + (r.posicao||'—') + ' · Desmont.: ' + (r.mes_desmont||'—') + (r.escultura_final!=null?' · '+r.escultura_final+'mm':'') + '</div>';
        html += '</div>';
      });
    }
  }

  lista.innerHTML = html;
  document.getElementById('painel-stock-sel').style.display = 'flex';
  document.getElementById('stock-overlay').style.display = 'block';
}

function fecharSelStock() {
  document.getElementById('painel-stock-sel').style.display = 'none';
  document.getElementById('stock-overlay').style.display = 'none';
}

function selecionarDeStock(linhaId, marca, medida, tipo, fornecedor, preco) {
  // Preencher campos — suporta tanto veículos (r-*) como reboques (rr-*)
  [['r-marca','rr-marca'], ['r-medida','rr-medida'], ['r-tipo','rr-tipo'], ['r-forn','rr-forn']].forEach(([v, r]) => {
    const elV = document.getElementById(v); if (elV) elV.value = v === 'r-tipo' ? tipo : (v === 'r-forn' ? fornecedor : (v === 'r-marca' ? marca : medida));
    const elR = document.getElementById(r); if (elR) elR.value = r === 'rr-tipo' ? tipo : (r === 'rr-forn' ? fornecedor : (r === 'rr-marca' ? marca : medida));
  });
  const elCustoV = document.getElementById('r-custo');  if (elCustoV) elCustoV.value = preco > 0 ? preco : '';
  const elCustoR = document.getElementById('rr-custo'); if (elCustoR) elCustoR.value = preco > 0 ? preco : '';
  stockLinhaSelId      = linhaId;
  stockDesmontadoSelId = null;
  const msg = '✓ Pneu de fatura: ' + marca + ' ' + medida + ' ' + tipo + (preco > 0 ? ' — ' + fmtEur(preco) : '') + ' — ' + fornecedor;
  ['r-stock-info','rr-stock-info'].forEach(id => { const el = document.getElementById(id); if (el) { el.textContent = msg; el.classList.remove('hidden'); } });
  fecharSelStock();
}

function selecionarDesmontadoDeStock(id, marca, medida, tipo, matriculaOrigem, tabela) {
  // Preencher campos — suporta tanto veículos (r-*) como reboques (rr-*)
  [['r-marca','rr-marca',marca], ['r-medida','rr-medida',medida], ['r-tipo','rr-tipo',tipo], ['r-forn','rr-forn','PARQUE'], ['r-custo','rr-custo','']].forEach(([v,r,val]) => {
    const elV = document.getElementById(v); if (elV) elV.value = val;
    const elR = document.getElementById(r); if (elR) elR.value = val;
  });
  stockLinhaSelId      = null;
  stockDesmontadoSelId = { id, tabela };
  const msg = '✓ Pneu de armazém: ' + marca + ' ' + medida + ' ' + tipo + ' — ' + (tabela === 'reboques' ? 'reboque' : 'veículo') + ' ' + matriculaOrigem;
  ['r-stock-info','rr-stock-info'].forEach(fid => { const el = document.getElementById(fid); if (el) { el.textContent = msg; el.classList.remove('hidden'); } });
  fecharSelStock();
}

async function descontarStock(linhaId) {
  if (!linhaId) return;
  const { data: linha } = await sb.from('stock_linhas').select('quantidade_disp').eq('id', linhaId).single();
  if (!linha) return;
  await sb.from('stock_linhas').update({ quantidade_disp: Math.max(0, linha.quantidade_disp - 1) }).eq('id', linhaId);
}
