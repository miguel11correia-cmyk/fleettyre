// ── REGISTAR ──────────────────────────────────────────────

async function guardarRegisto() {
  const quantidade = parseInt(document.getElementById('r-quantidade')?.value) || 1;
  const mat        = document.getElementById('r-mat').value.trim().toUpperCase();
  const categoria  = document.getElementById('r-pos').value;

  if (!mat) { showFeedback('r-feedback', 'Matrícula do camião é obrigatória.', true); return; }

  const veiculo   = listaVeiculos.find(v => v.matricula === mat);
  const resolucao = await resolverLugaresRegisto('pneus', mat, categoria, quantidade, veiculo?.num_eixos, SLOTS_VEICULO);
  if (!resolucao.ok) { showFeedback('r-feedback', resolucao.erro, true); return; }
  const posicoes = resolucao.posicoes;

  // Guardar um registo por lugar calculado (1 ou mais). O stock (fatura
  // ou pneu desmontado) só é descontado UMA vez no fim, pelo nº de
  // registos realmente guardados — descontar dentro do loop esvaziaria
  // a mesma linha de stock só no 1º registo (stockLinhaSelId já ficava
  // a null a meio do loop, perdendo o desconto dos seguintes).
  let sucessos = 0, erros = 0;
  for (let i = 0; i < quantidade; i++) {
    const ok = await _guardarRegistoUnico(posicoes[i]);
    if (ok) sucessos++; else erros++;
  }

  if (sucessos > 0) {
    if (stockLinhaSelId) await descontarStock(stockLinhaSelId, sucessos);
    if (stockDesmontadoSelId) {
      const { id, tabela } = stockDesmontadoSelId;
      await sb.from(tabela).update({ remontado: true }).eq('id', id);
    }
  }
  stockLinhaSelId      = null;
  stockDesmontadoSelId = null;

  if (erros === 0) {
    showFeedback('r-feedback', quantidade > 1 ? quantidade + ' registos guardados com sucesso.' : 'Montagem guardada com sucesso.');
    limparForm();
  } else {
    showFeedback('r-feedback', sucessos > 0 ? 'Erro em ' + erros + ' de ' + quantidade + ' registos.' : 'Erro ao guardar.', true);
  }
}

async function _guardarRegistoUnico(pos) {
  const mat    = document.getElementById('r-mat').value.trim().toUpperCase();
  const mes    = document.getElementById('r-mes').value.trim();
  const kmsStr = document.getElementById('r-kms').value;
  const marca  = document.getElementById('r-marca').value.trim().toUpperCase();
  const medida = document.getElementById('r-medida').value.trim();
  const subtipo= document.getElementById('r-subtipo').value;
  const tipo   = document.getElementById('r-tipo').value;
  const forn   = document.getElementById('r-forn').value.trim().toUpperCase();
  const matPneu= document.getElementById('r-matpneu').value.trim().toUpperCase();
  const custoP = parseFloat(document.getElementById('r-custo').value) || null;
  const custoMO= parseFloat(document.getElementById('r-mo').value)    || null;

  // Validações
  if (!mat) { showFeedback('r-feedback', 'Matrícula do camião é obrigatória.', true); return; }
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) { showFeedback('r-feedback', 'Mês inválido. Use o formato AAAA-MM.', true); return; }
  const kms = parseInt(kmsStr);
  if (!kms || kms <= 0) { showFeedback('r-feedback', 'KMs do conta-quilómetros é obrigatório.', true); return; }

  const registo = {
    empresa_id:  currentEmpresaId,
    matricula:   mat,
    mes_mont:    mes,
    kms_mont:    kms,
    posicao:     pos || null,
    marca:       marca || null,
    medida:      medida || null,
    subtipo:     subtipo || null,
    tipo:        tipo || null,
    fornecedor:  forn || null,
    mat_pneu:    matPneu || null,
    custo_pneu:  custoP,
    custo_mo:    custoMO,
    custo_total: (custoP || 0) + (custoMO || 0) || null,
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
    return false;
  }

  return true;
}

function limparForm() {
  ['r-mat','r-mes','r-kms','r-pos','r-marca','r-medida','r-subtipo','r-forn','r-matpneu','r-custo','r-mo']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('r-tipo').value = 'Novo';
  stockLinhaSelId      = null;
  stockDesmontadoSelId = null;
  const info = document.getElementById('r-stock-info');
  if (info) info.classList.add('hidden');
}

