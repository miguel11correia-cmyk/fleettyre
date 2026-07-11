let stockDesmontadoSelId = null; // id do registo desmontado a marcar como remontado

// ── STOCK ──────────────────────────────────────────────

async function loadStock() {
  loading(true);

  // Buscar faturas e pneus desmontados em paralelo
  const [{ data: faturas, error: errF }, desmontados] = await Promise.all([
    sb.from('stock_faturas').select('*, stock_linhas(*)').order('created_at', { ascending: false }),
    loadStockDesmontados()
  ]);

  loading(false);
  if (errF || !faturas) return;

  // Renderizar pneus desmontados
  renderStockDesmontados(desmontados);

  // Filtrar só faturas com pelo menos 1 linha com stock disponível
  const faturasAtivas = faturas.filter(f =>
    f.stock_linhas && f.stock_linhas.some(l => l.quantidade_disp > 0)
  );

  // KPIs
  let totalPneus = 0;
  let totalValor = 0;
  faturasAtivas.forEach(f => {
    f.stock_linhas.filter(l => l.quantidade_disp > 0).forEach(l => {
      totalPneus += l.quantidade_disp;
      totalValor += l.quantidade_disp * (l.preco_unitario || 0);
    });
  });

  document.getElementById('sk-faturas').textContent = faturasAtivas.length;
  document.getElementById('sk-pneus').textContent   = totalPneus + desmontados.length;
  document.getElementById('sk-valor').textContent   = totalValor > 0 ? fmtEur(totalValor) : '—';

  // Renderizar faturas
  const container = document.getElementById('stock-faturas-container');
  if (faturasAtivas.length === 0) {
    container.innerHTML = '<div class="card"><p class="empty-msg">Sem stock disponível. Clica em "+ Nova fatura" para registar.</p></div>';
    return;
  }

  container.innerHTML = faturasAtivas.map(f => {
    const linhasDisp = f.stock_linhas.filter(l => l.quantidade_disp > 0);
    const totalFat   = linhasDisp.reduce((s, l) => s + l.quantidade_disp * (l.preco_unitario || 0), 0);

    const linhasHTML = linhasDisp.map(l => {
      const pct = Math.round((l.quantidade_disp / l.quantidade_ini) * 100);
      const cor = pct <= 25 ? '#c93030' : pct <= 50 ? '#c47b0a' : '#1baf7a';
      return `<tr>
        <td>${l.marca || '—'}</td>
        <td>${l.medida || '—'}</td>
        <td>${tipoBadge(l.tipo)}</td>
        <td style="text-align:center">
          <span style="color:${cor};font-weight:500">${l.quantidade_disp}</span>
          <span style="color:var(--text3)"> / ${l.quantidade_ini}</span>
        </td>
        <td style="text-align:right">${l.preco_unitario ? fmtEur(l.preco_unitario) : '—'}</td>
        <td style="text-align:right">${l.preco_unitario ? fmtEur(l.quantidade_disp * l.preco_unitario) : '—'}</td>
      </tr>`;
    }).join('');

    return `<div class="card" style="margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div>
          <span style="font-size:14px;font-weight:500">📄 ${f.num_fatura}</span>
          <span style="color:var(--text2);font-size:12px;margin-left:10px">${f.fornecedor}</span>
          ${f.data_fatura ? `<span style="color:var(--text3);font-size:11px;margin-left:8px">${f.data_fatura}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:12px;font-weight:500;color:var(--amber)">${fmtEur(totalFat)} em stock</span>
          <button class="btn btn-sm" onclick="apagarFatura(${f.id},'${f.num_fatura.replace(/'/g,"\\'")}'" 
            style="height:26px;padding:0 8px;font-size:11px;color:var(--red);border-color:#f5c6c6">
            🗑 Apagar
          </button>
        </div>
      </div>
      ${f.notas ? `<p style="font-size:11px;color:var(--text3);margin-bottom:10px;font-style:italic">${f.notas}</p>` : ''}
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Marca</th><th>Medida</th><th>Tipo</th>
            <th style="text-align:center">Disponível / Total</th>
            <th style="text-align:right">Preço unit. (€)</th>
            <th style="text-align:right">Valor disp. (€)</th>
          </tr></thead>
          <tbody>${linhasHTML}</tbody>
        </table>
      </div>
    </div>`;
  }).join('');
}

function abrirNovaFatura() {
  linhasFatura = [];
  document.getElementById('f-num').value   = '';
  document.getElementById('f-forn').value  = '';
  document.getElementById('f-data').value  = '';
  document.getElementById('f-notas').value = '';
  document.getElementById('f-feedback').classList.add('hidden');
  renderLinhasFatura();
  document.getElementById('painel-fatura').classList.add('open');
}

async function apagarFatura(id, numFatura) {
  if (!confirm(`Tens a certeza que queres apagar a fatura ${numFatura} e todos os pneus associados?`)) return;
  loading(true);
  // CASCADE no Supabase apaga automaticamente as linhas associadas
  const { error } = await sb.from('stock_faturas').delete().eq('id', id);
  loading(false);
  if (error) { alert('Erro ao apagar: ' + error.message); return; }
  loadStock();
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
  if (linhasFatura.length === 0) {
    container.innerHTML = `<p style="font-size:12px;color:var(--text3);text-align:center;padding:8px">
      Clica "+ Linha" para adicionar pneus desta fatura.</p>`;
    return;
  }
  container.innerHTML = linhasFatura.map((l, i) => `
    <div style="border:0.5px solid var(--border);border-radius:var(--radius);padding:10px;margin-bottom:8px;background:var(--surface1)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:11px;font-weight:500;color:var(--text2)">Linha ${i+1}</span>
        <button class="btn-close" onclick="removerLinhaFatura(${i})" style="font-size:12px">✕</button>
      </div>
      <div class="g3" style="gap:8px;margin-bottom:8px">
        <div class="frow" style="margin:0"><label>Marca</label>
          <input type="text" value="${l.marca}" oninput="linhasFatura[${i}].marca=this.value.toUpperCase();this.value=this.value.toUpperCase()" placeholder="MICHELIN"></div>
        <div class="frow" style="margin:0"><label>Medida</label>
          <input type="text" value="${l.medida}" oninput="linhasFatura[${i}].medida=this.value" placeholder="315/80"></div>
        <div class="frow" style="margin:0"><label>Tipo</label>
          <select onchange="linhasFatura[${i}].tipo=this.value">
            <option ${l.tipo==='Novo'?'selected':''}>Novo</option>
            <option ${l.tipo==='Remix'?'selected':''}>Remix</option>
            <option ${l.tipo==='Piso Aberto'?'selected':''}>Piso Aberto</option>
          </select></div>
      </div>
      <div class="g2" style="gap:8px">
        <div class="frow" style="margin:0"><label>Quantidade *</label>
          <input type="number" value="${l.quantidade}" oninput="linhasFatura[${i}].quantidade=this.value" placeholder="ex: 4" min="1"></div>
        <div class="frow" style="margin:0"><label>Preço unitário (€)</label>
          <input type="number" value="${l.preco}" oninput="linhasFatura[${i}].preco=this.value" placeholder="ex: 320" min="0" step="0.01"></div>
      </div>
    </div>`).join('');
}

async function guardarFatura() {
  const numFat = document.getElementById('f-num').value.trim().toUpperCase();
  const forn   = document.getElementById('f-forn').value.trim().toUpperCase();
  const data   = document.getElementById('f-data').value.trim() || null;
  const notas  = document.getElementById('f-notas').value.trim() || null;

  if (!numFat) { showFeedback('f-feedback', 'Nº de fatura é obrigatório.', true); return; }
  if (!forn)   { showFeedback('f-feedback', 'Fornecedor é obrigatório.', true); return; }
  if (linhasFatura.length === 0) { showFeedback('f-feedback', 'Adiciona pelo menos um pneu.', true); return; }

  // Validar linhas
  for (let i = 0; i < linhasFatura.length; i++) {
    const l = linhasFatura[i];
    const qty = parseInt(l.quantidade);
    if (!qty || qty <= 0) {
      showFeedback('f-feedback', `Linha ${i+1}: quantidade inválida.`, true); return;
    }
  }

  loading(true);

  // Criar fatura
  const { data: faturaData, error: errF } = await sb
    .from('stock_faturas')
    .insert([{ num_fatura: numFat, fornecedor: forn, data_fatura: data, notas }])
    .select()
    .single();

  if (errF) {
    loading(false);
    showFeedback('f-feedback', 'Erro ao criar fatura: ' + errF.message, true);
    return;
  }

  // Criar linhas
  const linhasInsert = linhasFatura.map(l => ({
    fatura_id:      faturaData.id,
    marca:          l.marca   || null,
    medida:         l.medida  || null,
    tipo:           l.tipo    || 'Novo',
    quantidade_ini: parseInt(l.quantidade),
    quantidade_disp:parseInt(l.quantidade),
    preco_unitario: l.preco ? parseFloat(l.preco) : null,
  }));

  const { error: errL } = await sb.from('stock_linhas').insert(linhasInsert);
  loading(false);

  if (errL) {
    showFeedback('f-feedback', 'Erro ao guardar linhas: ' + errL.message, true);
    return;
  }

  showFeedback('f-feedback', 'Fatura guardada com sucesso.');
  linhasFatura = [];
  setTimeout(() => { fecharPainelFatura(); loadStock(); }, 800);
}

async function abrirSelStock() {
  loading(true);
  const { data: faturas, error } = await sb
    .from('stock_faturas')
    .select('*, stock_linhas(*)')
    .order('created_at', { ascending: false });
  loading(false);

  if (error || !faturas) return;

  // Só linhas com stock disponível
  const linhasDisp = [];
  faturas.forEach(f => {
    (f.stock_linhas || []).filter(l => l.quantidade_disp > 0).forEach(l => {
      linhasDisp.push({ ...l, num_fatura: f.num_fatura, fornecedor: f.fornecedor });
    });
  });

  // Juntar pneus de faturas com pneus desmontados em armazém
  const desmontadosDisp = await loadStockDesmontados();

  const lista = document.getElementById('stock-sel-lista');

  if (linhasDisp.length === 0 && desmontadosDisp.length === 0) {
    lista.innerHTML = '<p class="empty-msg">Sem stock disponível. Regista uma fatura ou desmonta pneus com destino Stock/Abrir Piso.</p>';
  } else {
    let html = '';

    // Secção faturas
    if (linhasDisp.length > 0) {
      html += '<div style="font-size:10px;font-weight:500;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">📄 De faturas</div>';
      linhasDisp.forEach(l => {
        html += '<div style="border:0.5px solid var(--border);border-radius:var(--radius);padding:10px;margin-bottom:8px;cursor:pointer" onclick="selecionarDeStock(' + l.id + ',\'' + (l.marca||'').replace(/'/g,"\'") + '\',\'' + (l.medida||'').replace(/'/g,"\'") + '\',\'' + (l.tipo||'') + '\',\'' + (l.fornecedor||'').replace(/'/g,"\'") + '\',' + (l.preco_unitario||0) + ')">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center">';
        html += '<div><span style="font-weight:500;font-size:13px">' + (l.marca||'—') + ' ' + (l.medida||'') + '</span><span style="margin-left:8px">' + tipoBadge(l.tipo) + '</span></div>';
        html += '<span style="color:var(--amber);font-weight:500">' + (l.preco_unitario ? fmtEur(l.preco_unitario) : '—') + '</span>';
        html += '</div>';
        html += '<div style="font-size:11px;color:var(--text2);margin-top:4px">📄 ' + l.num_fatura + ' · ' + l.fornecedor + ' · <span style="color:var(--green);font-weight:500">' + l.quantidade_disp + ' disponíveis</span></div>';
        html += '</div>';
      });
    }

    // Secção pneus desmontados
    if (desmontadosDisp.length > 0) {
      html += '<div style="font-size:10px;font-weight:500;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin:12px 0 8px">🔧 Desmontados em armazém</div>';
      desmontadosDisp.forEach(r => {
        html += '<div style="border:0.5px solid var(--border);border-radius:var(--radius);padding:10px;margin-bottom:8px;cursor:pointer" onclick="selecionarDesmontadoDeStock(' + r.id + ',\'' + (r.marca||'').replace(/'/g,"\'") + '\',\'' + (r.medida||'').replace(/'/g,"\'") + '\',\'' + (r.tipo||'') + '\',\'' + r.matricula.replace(/'/g,"\'") + '\')">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center">';
        html += '<div><span style="font-weight:500;font-size:13px">' + (r.marca||'—') + ' ' + (r.medida||'') + '</span><span style="margin-left:8px">' + tipoBadge(r.tipo) + '</span></div>';
        html += '<span class="badge b-piso">' + r.destino + '</span>';
        html += '</div>';
        html += '<div style="font-size:11px;color:var(--text2);margin-top:4px">🚛 ' + r.matricula + ' · ' + (r.posicao||'—') + ' · Desmont.: ' + (r.mes_desmont||'—') + (r.escultura_final != null ? ' · ' + r.escultura_final + 'mm' : '') + '</div>';
        html += '</div>';
      });
    }

    lista.innerHTML = html;
  }

  document.getElementById('painel-stock-sel').style.display = 'flex';
  document.getElementById('stock-overlay').style.display = 'block';
}

function fecharSelStock() {
  document.getElementById('painel-stock-sel').style.display = 'none';
  document.getElementById('stock-overlay').style.display = 'none';
}

function selecionarDeStock(linhaId, marca, medida, tipo, fornecedor, preco) {
  // Preencher campos do formulário de registo
  document.getElementById('r-marca').value  = marca;
  document.getElementById('r-medida').value = medida;
  document.getElementById('r-tipo').value   = tipo;
  document.getElementById('r-forn').value   = fornecedor;
  document.getElementById('r-custo').value  = preco > 0 ? preco : '';

  // Guardar id da linha para descontar stock ao guardar
  stockLinhaSelId = linhaId;

  // Mostrar info do stock seleccionado
  const info = document.getElementById('r-stock-info');
  info.textContent = `✓ Pneu seleccionado de stock: ${marca} ${medida} ${tipo} — ${preco > 0 ? fmtEur(preco) : 'sem preço'} — Fornecedor: ${fornecedor}`;
  info.classList.remove('hidden');

  fecharSelStock();
}

async function descontarStock(linhaId) {
  if (!linhaId) return;

  // Buscar quantidade actual
  const { data: linha, error: errL } = await sb
    .from('stock_linhas')
    .select('quantidade_disp')
    .eq('id', linhaId)
    .single();

  if (errL || !linha) return;

  const novaQty = Math.max(0, linha.quantidade_disp - 1);
  await sb.from('stock_linhas').update({ quantidade_disp: novaQty }).eq('id', linhaId);
}

async function loadStockDesmontados() {
  const { data, error } = await sb
    .from('pneus')
    .select('*')
    .in('destino', ['Abrir Piso', 'Stock'])
    .not('mes_desmont', 'is', null)
    .eq('remontado', false)
    .order('mes_desmont', { ascending: false });

  if (error || !data) return [];
  return data;
}

function renderStockDesmontados(pneus) {
  const container = document.getElementById('stock-desmontados-container');
  const kpiDesmont = document.getElementById('sk-desmont');
  if (kpiDesmont) kpiDesmont.textContent = pneus.length;

  if (pneus.length === 0) {
    container.innerHTML = '<p class="empty-msg">Nenhum pneu desmontado em armazém. Quando desmontares pneus com destino "Abrir Piso" ou "Stock" aparecem aqui.</p>';
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Matrícula camião</th>
          <th>Mês desmont.</th>
          <th>Posição</th>
          <th>Marca</th>
          <th>Medida</th>
          <th>Tipo</th>
          <th>Escultura</th>
          <th>Destino</th>
          <th>KMs efectuados</th>
        </tr></thead>
        <tbody>
          ${pneus.map(r => {
            const kmsEf = (r.kms_desmont && r.kms_mont && r.kms_desmont > r.kms_mont)
              ? fmt(r.kms_desmont - r.kms_mont) : '—';
            const escStr = r.escultura_final != null ? r.escultura_final + '\u202fmm' : '—';
            const destCls = r.destino === 'Abrir Piso' ? 'b-piso' : 'b-remix';
            return `<tr>
              <td><strong>${r.matricula}</strong></td>
              <td>${r.mes_desmont || '—'}</td>
              <td>${r.posicao || '—'}</td>
              <td>${r.marca || '—'}</td>
              <td>${r.medida || '—'}</td>
              <td>${tipoBadge(r.tipo)}</td>
              <td>${escStr}</td>
              <td><span class="badge ${destCls}">${r.destino}</span></td>
              <td style="text-align:right">${kmsEf}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function selecionarDesmontadoDeStock(id, marca, medida, tipo, matriculaOrigem) {
  document.getElementById('r-marca').value  = marca;
  document.getElementById('r-medida').value = medida;
  document.getElementById('r-tipo').value   = tipo;
  document.getElementById('r-forn').value   = 'PARQUE';
  document.getElementById('r-custo').value  = '';

  stockLinhaSelId      = null; // não desconta de fatura
  stockDesmontadoSelId = id;   // guardar para marcar como remontado ao guardar

  const info = document.getElementById('r-stock-info');
  info.textContent = `✓ Pneu de armazém: ${marca} ${medida} ${tipo} — vindo do camião ${matriculaOrigem}`;
  info.classList.remove('hidden');

  fecharSelStock();
}

