// js/frota.js e js/reboques/frota_r.js — geradores de linha das
// tabelas "Lugares"/"Histórico" (linhaLugar/linhaHistorico e
// equivalentes de reboque). São funções puras (devolvem uma string,
// não escrevem em document), por isso não precisam do DOM stub — só
// de frotaSelecionados/rfrotaSelecionados (let's de topo, geridos
// com o mesmo truque de globalThis.__set... usado em compras.test.js/
// stock.test.js/inicio.test.js) e, para os reboques, de LIMITES_EIXO
// (const de alertas_r.js, visível por partilhar o mesmo vm.Context —
// mesmo mecanismo de TIPOS_ORDEM em analytics-reboques.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadAppScripts } = require('./helpers/load-app-scripts');
const { criarDomStub } = require('./helpers/dom-stub');

// pdf-anexo.js regista um addEventListener de topo (fecho do menu
// ver/substituir ao clicar fora) — precisa de um `document`, mesmo
// que linhaLugar/linhaHistorico não escrevam nele directamente.
function carregarVeiculos() {
  const ctx = loadAppScripts(['js/utils.js', 'js/pdf-anexo.js', 'js/frota.js'], { document: criarDomStub().document });
  vm.runInContext('globalThis.__setFrotaSel = (s) => { frotaSelecionados = s; };', ctx);
  return ctx;
}

function carregarReboques() {
  const ctx = loadAppScripts(['js/utils.js', 'js/pdf-anexo.js', 'js/reboques/alertas_r.js', 'js/reboques/frota_r.js'], { document: criarDomStub().document });
  vm.runInContext('globalThis.__setRfrotaSel = (s) => { rfrotaSelecionados = s; };', ctx);
  return ctx;
}

test('linhaLugar — lugar vazio mostra "— vazio —" com botão Montar; preenchido mostra os dados e o aviso de posição não reconhecida quando pedido', () => {
  const ctx = carregarVeiculos();

  const vazio = ctx.linhaLugar('Direção Esq', null, 'AA-00-AA', 100000);
  assert.match(vazio, /— vazio —/);
  assert.match(vazio, /montarNoLugar\('AA-00-AA','Direção Esq'\)/);

  const r = { id: 7, posicao: 'Direção Esq', marca: 'MICHELIN', tipo: 'Novo', kms_mont: 10000, mes_mont: '2026-01', rasto_final: 3, custo_pneu: 500 };
  const preenchido = ctx.linhaLugar('Direção Esq', r, 'AA-00-AA', 100000);
  assert.match(preenchido, /MICHELIN/);
  assert.match(preenchido, /badge b-alert/, 'rasto final <= 3mm destaca-se a vermelho');
  assert.doesNotMatch(preenchido, /⚠/, 'sem aviso, não mostra o ícone');

  const comAviso = ctx.linhaLugar('Direção Esq', r, 'AA-00-AA', 100000, true);
  assert.match(comAviso, /⚠/, 'aviso=true mostra o ícone de posição não reconhecida');
});

test('linhaLugar — KMs efectuados estimados (ainda montado) aparecem com "~"; checkbox reflecte frotaSelecionados', () => {
  const ctx = carregarVeiculos();
  const r = { id: 7, posicao: 'Direção Esq', kms_mont: 10000, mes_mont: '2026-01', mes_desmont: null };

  const semSelecao = ctx.linhaLugar('Direção Esq', r, 'AA-00-AA', 50000);
  assert.match(semSelecao, /~40 000/, 'ainda montado -> KMs efectuados vêm do km actual, marcados como estimativa');
  assert.doesNotMatch(semSelecao, /checked/);

  ctx.__setFrotaSel(new Set([7]));
  const comSelecao = ctx.linhaLugar('Direção Esq', r, 'AA-00-AA', 50000);
  assert.match(comSelecao, /checked/, 'id 7 está seleccionado -> checkbox vem marcada');
});

test('linhaHistorico — activo mostra "Desmontar" + checkbox; desmontado mostra o ícone de confirmação e soma custo_pneu+custo_mo', () => {
  const ctx = carregarVeiculos();

  const ativo = ctx.linhaHistorico({ id: 1, matricula: 'AA-00-AA', kms_mont: 0, mes_mont: '2026-01', mes_desmont: null }, 10000);
  assert.match(ativo, /Desmontar/);
  assert.match(ativo, /type="checkbox"/);

  const desmontado = ctx.linhaHistorico({ id: 2, matricula: 'AA-00-AA', kms_mont: 0, kms_desmont: 50000, mes_mont: '2025-01', mes_desmont: '2026-01', custo_pneu: 400, custo_mo: 20 }, null);
  assert.doesNotMatch(desmontado, /Desmontar/);
  assert.doesNotMatch(desmontado, /type="checkbox"/, 'já desmontado, não há seleção múltipla para ele');
  assert.match(desmontado, /€ 420,00/, 'custo total = 400 (pneu) + 20 (mão de obra)');
});

test('linhaLugarReboque — nível de alerta por duração usa o limite do PRÓPRIO eixo (Eixo 2 tolera muito mais meses que o Eixo 1)', () => {
  const ctx = carregarReboques();
  const hoje = '2026-11';

  // Eixo 1: aviso aos 12 meses, crítico aos 14. 15 meses -> crítico.
  const e1 = ctx.linhaLugarReboque('Eixo 1 Esq', { id: 1, eixo: 1, mes_mont: '2025-08', marca: 'X' }, 'R-01', hoje);
  assert.match(e1, /badge b-alert/);

  // Eixo 2: só é crítico aos 24. Os mesmos ~15 meses (2025-08 -> 2026-11) não acendem nada.
  const e2 = ctx.linhaLugarReboque('Eixo 2 Esq', { id: 2, eixo: 2, mes_mont: '2025-08', marca: 'X' }, 'R-01', hoje);
  assert.doesNotMatch(e2, /badge b-alert|badge b-warn/, 'Eixo 2 ainda está ok aos mesmos ~15 meses');

  const vazio = ctx.linhaLugarReboque('Eixo 3 Esq', null, 'R-01', hoje);
  assert.match(vazio, /— vazio —/);
  assert.match(vazio, /montarNoLugarReboque\('R-01','Eixo 3 Esq'\)/);
});

test('linhaHistoricoReboque — activo usa mesesEntre(mont, hoje); desmontado usa mesesEntre(mont, desmont), não a data de hoje', () => {
  const ctx = carregarReboques();

  const ativo = ctx.linhaHistoricoReboque({ id: 1, eixo: 1, mes_mont: '2026-01', mes_desmont: null }, '2026-11');
  assert.match(ativo, />10 meses</, '2026-01 -> 2026-11 = 10 meses, usando "hoje"');
  assert.match(ativo, /Desmontar/);

  const desmontado = ctx.linhaHistoricoReboque({ id: 2, eixo: 1, mes_mont: '2024-01', mes_desmont: '2025-01', custo_total: 220 }, '2026-11');
  assert.match(desmontado, />12 meses</, 'usa a data de desmontagem (12 meses), não "hoje" (que daria quase 3 anos)');
  assert.doesNotMatch(desmontado, /Desmontar/);
  assert.match(desmontado, /€ 220,00/);
});
