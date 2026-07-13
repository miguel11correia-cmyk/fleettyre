// ── REGISTAR ──────────────────────────────────────────────

async function guardarRegisto() {
  const mat    = document.getElementById('r-mat').value.trim().toUpperCase();
  const mes    = document.getElementById('r-mes').value.trim();
  const kmsStr = document.getElementById('r-kms').value;
  const pos    = document.getElementById('r-pos').value.trim().toUpperCase();
  const marca  = document.getElementById('r-marca').value.trim().toUpperCase();
  const medida = document.getElementById('r-medida').value.trim();
  const tipo   = document.getElementById('r-tipo').value;
  const forn   = document.getElementById('r-forn').value.trim().toUpperCase();
  const matPneu= document.getElementById('r-matpneu').value.trim().toUpperCase();
  const custoP = parseFloat(document.getElementById('r-custo').value) || null;
  const custoMO= parseFloat(document.getElementById('r-mo').value)    || null;

  // Validações
  if (!mat) { showFeedback('r-feedback', 'Matrícula do camião é obrigatória.', true); return; }
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) { showFeedback('r-feedback', 'Mês inválido. Usa o formato AAAA-MM.', true); return; }
  const kms = parseInt(kmsStr);
  if (!kms || kms <= 0) { showFeedback('r-feedback', 'KMs do conta-quilómetros é obrigatório.', true); return; }

  const registo = {
    matricula:   mat,
    mes_mont:    mes,
    kms_mont:    kms,
    posicao:     pos || null,
    marca:       marca || null,
    medida:      medida || null,
    tipo:        tipo || null,
    fornecedor:  forn || null,
    mat_pneu:    matPneu || null,
    custo_pneu:  custoP,
    custo_mo:    custoMO,
    // custo_total é calculado automaticamente pelo Supabase
    // Campos desmontagem inicialmente nulos
    mes_desmont:     null,
    kms_desmont:     null,
    escultura_final: null,
    destino:         null,
  };

  loading(true);
  const { error } = await sb.from('pneus').insert([registo]);
  loading(false);

  if (error) {
    showFeedback('r-feedback', 'Erro ao guardar: ' + error.message, true);
    return;
  }
  // Descontar stock de fatura se foi seleccionado
  if (stockLinhaSelId) {
    await descontarStock(stockLinhaSelId);
    stockLinhaSelId = null;
  }

  // Marcar pneu desmontado como remontado — na tabela correcta (pneus ou reboques)
  if (stockDesmontadoSelId) {
    const { id, tabela } = stockDesmontadoSelId;
    await sb.from(tabela).update({ remontado: true }).eq('id', id);
    stockDesmontadoSelId = null; // reset
  }

  showFeedback('r-feedback', 'Montagem guardada com sucesso.');
  limparForm();
}

function limparForm() {
  ['r-mat','r-mes','r-kms','r-pos','r-marca','r-medida','r-forn','r-matpneu','r-custo','r-mo']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('r-tipo').value = 'Novo';
  stockLinhaSelId      = null;
  stockDesmontadoSelId = null;
  const info = document.getElementById('r-stock-info');
  if (info) info.classList.add('hidden');
}

