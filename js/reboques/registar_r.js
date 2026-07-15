// ── REBOQUES/REGISTAR.JS ─────────────────────────────────────────

async function guardarRegistoReboque() {
  const quantidade = parseInt(document.getElementById('rr-quantidade')?.value) || 1;
  if (quantidade > 1) {
    let erros = 0;
    for (let i = 0; i < quantidade; i++) {
      const ok = await _guardarRegistoReboqueUnico();
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
  const ok = await _guardarRegistoReboqueUnico();
  if (ok) { showFeedback('rr-feedback', 'Montagem guardada com sucesso.'); limparFormReboque(); }
}

async function _guardarRegistoReboqueUnico() {

  if (!mat) { showFeedback('rr-feedback', 'Matrícula do reboque é obrigatória.', true); return; }
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) { showFeedback('rr-feedback', 'Mês inválido. Usa AAAA-MM.', true); return; }

  const registo = {
    matricula:  mat,
    mes_mont:   mes,
    posicao:    pos    || null,
    eixo:       eixo,
    marca:      marca  || null,
    medida:     medida || null,
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

  if (error) { showFeedback('rr-feedback', 'Erro ao guardar: ' + error.message, true); return; }
  showFeedback('rr-feedback', 'Montagem guardada com sucesso.');
  limparFormReboque();
}

function limparFormReboque() {
  ['rr-mat','rr-mes','rr-pos','rr-marca','rr-medida','rr-forn','rr-matpneu','rr-custo','rr-mo']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const eixo = document.getElementById('rr-eixo');
  if (eixo) eixo.value = '1';
  const tipo = document.getElementById('rr-tipo');
  if (tipo) tipo.value = 'Novo';
  const info = document.getElementById('rr-stock-info');
  if (info) info.classList.add('hidden');
}
