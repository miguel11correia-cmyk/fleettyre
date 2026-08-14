// ── REBOQUES/REGISTAR.JS ─────────────────────────────────────────

async function guardarRegistoReboque() {
  const quantidade = parseInt(document.getElementById('rr-quantidade')?.value) || 1;
  const mat        = document.getElementById('rr-mat').value.trim().toUpperCase();
  const categoria  = document.getElementById('rr-eixo').value;

  if (!mat) { showFeedback('rr-feedback', 'Matrícula do reboque é obrigatória.', true); return; }

  const reboque   = listaReboquesFrota.find(v => v.matricula === mat);
  const resolucao = await resolverLugaresRegisto('reboques', mat, categoria, quantidade, reboque?.num_eixos, SLOTS_REBOQUE);
  if (!resolucao.ok) { showFeedback('rr-feedback', resolucao.erro, true); return; }
  const posicoes = resolucao.posicoes;

  if (quantidade > 1) {
    let erros = 0;
    for (let i = 0; i < quantidade; i++) {
      const ok = await _guardarRegistoReboqueUnico(posicoes[i]);
      if (!ok) { erros++; }
    }
    if (erros === 0) {
      showFeedback('rr-feedback', quantidade + ' registos guardados com sucesso.');
      limparFormReboque();
    } else {
      showFeedback('rr-feedback', 'Erro em ' + erros + ' de ' + quantidade + ' registos.', true);
    }
    return;
  }
  const ok = await _guardarRegistoReboqueUnico(posicoes[0]);
  if (ok) { showFeedback('rr-feedback', 'Montagem guardada com sucesso.'); limparFormReboque(); }
}

async function _guardarRegistoReboqueUnico(pos) {
  const mat    = document.getElementById('rr-mat').value.trim().toUpperCase();
  const mes    = document.getElementById('rr-mes').value.trim();
  const eixo   = eixoDoLugar(pos);
  const marca  = document.getElementById('rr-marca').value.trim().toUpperCase();
  const medida = document.getElementById('rr-medida').value.trim();
  const subtipo= document.getElementById('rr-subtipo').value;
  const tipo   = document.getElementById('rr-tipo').value;
  const forn   = document.getElementById('rr-forn').value.trim().toUpperCase();
  const matPneu= document.getElementById('rr-matpneu').value.trim().toUpperCase();
  const custoP = parseFloat(document.getElementById('rr-custo').value) || null;
  const custoMO= parseFloat(document.getElementById('rr-mo').value)    || null;

  if (!mat) { showFeedback('rr-feedback', 'Matrícula do reboque é obrigatória.', true); return false; }
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) { showFeedback('rr-feedback', 'Mês inválido. Use o formato AAAA-MM.', true); return false; }

  const registo = {
    empresa_id: currentEmpresaId,
    matricula:  mat,
    mes_mont:   mes,
    eixo:       eixo,
    posicao:    pos    || null,
    marca:      marca  || null,
    medida:     medida || null,
    subtipo:    subtipo || null,
    tipo:       tipo   || null,
    fornecedor: forn   || null,
    mat_pneu:   matPneu|| null,
    custo_pneu:  custoP,
    custo_mo:    custoMO,
    custo_total: ((custoP || 0) + (custoMO || 0)) || null,
    mes_desmont:     null,
    escultura_final: null,
    destino:         null,
  };

  loading(true);
  const { error } = await sb.from('reboques').insert([registo]);
  loading(false);

  if (error) { showFeedback('rr-feedback', 'Erro ao guardar: ' + error.message, true); return false; }

  // Descontar stock de fatura se foi selecionado
  if (stockLinhaSelId) {
    await descontarStock(stockLinhaSelId);
    stockLinhaSelId = null;
  }

  // Marcar pneu desmontado como remontado — na tabela correta (pneus ou reboques)
  if (stockDesmontadoSelId) {
    const { id, tabela } = stockDesmontadoSelId;
    await sb.from(tabela).update({ remontado: true }).eq('id', id);
    stockDesmontadoSelId = null;
  }

  return true;
}

function limparFormReboque() {
  ['rr-mat','rr-mes','rr-marca','rr-medida','rr-subtipo','rr-forn','rr-matpneu','rr-custo','rr-mo']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const eixo = document.getElementById('rr-eixo');
  if (eixo) eixo.value = 'Eixo 1';
  const tipo = document.getElementById('rr-tipo');
  if (tipo) tipo.value = 'Novo';
  stockLinhaSelId      = null;
  stockDesmontadoSelId = null;
  const info = document.getElementById('rr-stock-info');
  if (info) info.classList.add('hidden');
}
