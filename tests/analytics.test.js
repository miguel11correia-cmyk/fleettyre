// js/analytics.js — ROI por tipo de pneu e a tabela combinada de
// "Comparação entre veículos" (calcularComparacaoCategoria já coberto
// em tests/custo-por-km.test.js). Usa o DOM stub porque estas funções
// escrevem directamente em innerHTML/textContent.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAppScripts } = require('./helpers/load-app-scripts');
const { criarDomStub } = require('./helpers/dom-stub');

// Mesma ordem de <script> do app.html: utils -> alertas -> frota (dá o
// fmtEurKm que analytics.js usa) -> analytics.
function carregar(document) {
  return loadAppScripts(['js/utils.js', 'js/alertas.js', 'js/frota.js', 'js/analytics.js'], { document });
}

test('renderRoiPorTipo — agrupa por tipo, só regista histórico completo (desmontado + custo)', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom.document);

  // kms_mont nunca pode ser 0 nestes dados de teste: `!r.kms_mont` no
  // filtro da própria função trata 0 como "em falta" (falsy), tal como
  // o resto da app assume kms_mont sempre > 0 na prática.
  const data = [
    { tipo: 'Novo', kms_mont: 1000, kms_desmont: 100000, custo_pneu: 500 },
    { tipo: 'Novo', kms_mont: 1000, kms_desmont: 100000, custo_pneu: 700 },
    { tipo: 'Remix', kms_mont: 1000, kms_desmont: 50000, custo_pneu: 200 },
    { tipo: 'Novo', kms_mont: 1000, kms_desmont: null, custo_pneu: 500 }, // ainda montado, ignorado
    { tipo: 'Novo', kms_mont: 1000, kms_desmont: 100000, custo_pneu: null }, // sem custo, ignorado
  ];

  ctx.renderRoiPorTipo(data);

  const html = dom.obter('roi-tipo-tbody').innerHTML;
  assert.match(html, /Novo/);
  assert.match(html, /Remix/);
  assert.match(html, />2</, 'Novo tem 2 registos completos, não 3 (um ainda montado, outro sem custo)');
});

test('renderRoiPorTipo — sem nenhum registo completo, mostra a mensagem vazia', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom.document);
  ctx.renderRoiPorTipo([{ tipo: 'Novo', kms_mont: 0, kms_desmont: null, custo_pneu: null }]);
  assert.match(dom.obter('roi-tipo-tbody').innerHTML, /Sem registos/);
});

test('renderComparacaoVeiculos — tabela combinada agrupa Direção/Tração por matrícula, mostra "Sem dados suficientes" quando falta uma categoria', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom.document);

  const matA = 'AA-00-AA', matB = 'BB-00-BB';
  const base = { mes_mont: '2026-01', kms_mont: 100000, mes_desmont: null, marca: 'MICHELIN' };
  const data = [
    { ...base, matricula: matA, posicao: 'Direção Esq', custo_pneu: 500 },
    { ...base, matricula: matA, posicao: 'Direção Drt', custo_pneu: 500 },
    { ...base, matricula: matA, posicao: 'Tração Esq Int', custo_pneu: 300 },
    { ...base, matricula: matA, posicao: 'Tração Esq Ext', custo_pneu: 300 },
    { ...base, matricula: matB, posicao: 'Direção Esq', custo_pneu: 400 },
    { ...base, matricula: matB, posicao: 'Direção Drt', custo_pneu: 400 },
    // matB não tem nenhum pneu de Tração.
  ];
  const kmAtualPorMat = { [matA]: 150000, [matB]: 150000 };

  ctx.renderComparacaoVeiculos(data, kmAtualPorMat);

  // KPIs por categoria, calculados em separado.
  assert.equal(dom.obter('an-dir-n-veiculos').textContent, 2);
  assert.equal(dom.obter('an-tra-n-veiculos').textContent, 1);

  // Tabela combinada: 2 linhas para A (Direção+Tração), 2 para B (Direção
  // + aviso "sem dados" em Tração).
  const html = dom.obter('an-veiculos-tbody').innerHTML;
  assert.equal((html.match(new RegExp(matA, 'g')) || []).length, 2);
  assert.equal((html.match(new RegExp(matB, 'g')) || []).length, 2);
  assert.match(html, /Sem dados suficientes/);

  // Ordenada por matrícula (AA antes de BB).
  assert.ok(html.indexOf(matA) < html.indexOf(matB));
});
