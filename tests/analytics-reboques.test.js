// js/reboques/analytics_r.js — equivalente de tests/analytics.test.js
// para reboques (meses em vez de KMs, Eixo 1/2/3 em vez de
// Direção/Tração). calcularComparacaoCategoriaReboques já coberto em
// tests/custo-por-km.test.js (eurMesPorEixo).
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAppScripts } = require('./helpers/load-app-scripts');
const { criarDomStub } = require('./helpers/dom-stub');

// TIPOS_ORDEM é um `const` de analytics.js, usado dentro de
// renderRoiPorTipoReboques — como os dois ficheiros correm na mesma
// vm.Context, a const de um fica visível para funções do outro,
// exactamente como aconteceria com dois <script> no mesmo app.html.
function carregar(document) {
  return loadAppScripts(['js/utils.js', 'js/alertas.js', 'js/analytics.js', 'js/reboques/analytics_r.js'], { document });
}

test('renderRoiPorTipoReboques — agrupa por tipo usando meses de duração, não KMs', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom.document);

  const data = [
    { tipo: 'Novo', mes_mont: '2024-01', mes_desmont: '2025-01', custo_pneu: 240 }, // 12 meses
    { tipo: 'Novo', mes_mont: '2024-01', mes_desmont: '2025-01', custo_pneu: 240 },
    { tipo: 'Remix', mes_mont: '2024-01', mes_desmont: '2024-07', custo_pneu: 120 }, // 6 meses
    { tipo: 'Novo', mes_mont: '2024-01', mes_desmont: null, custo_pneu: 240 }, // ainda montado
  ];

  ctx.renderRoiPorTipoReboques(data);
  const html = dom.obter('rroi-tipo-tbody').innerHTML;
  assert.match(html, /Novo/);
  assert.match(html, /Remix/);
  assert.match(html, /12 meses/);
});

test('renderComparacaoReboques — tabela combinada dos 3 eixos por reboque, só eixos com dados têm linha preenchida', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom.document);

  const matA = 'A-REB', matB = 'B-REB';
  const data = [
    // A: Eixo 1 activo + histórico para a duração média.
    { matricula: matA, eixo: 1, mes_mont: '2026-01', mes_desmont: null, custo_pneu: 200 },
    { matricula: matA, eixo: 1, mes_mont: '2024-01', mes_desmont: '2025-01', custo_pneu: 210 },
    // A: Eixo 2 activo + histórico.
    { matricula: matA, eixo: 2, mes_mont: '2026-01', mes_desmont: null, custo_pneu: 600 },
    { matricula: matA, eixo: 2, mes_mont: '2023-01', mes_desmont: '2025-01', custo_pneu: 620 },
    // B: só Eixo 1.
    { matricula: matB, eixo: 1, mes_mont: '2026-01', mes_desmont: null, custo_pneu: 150 },
    { matricula: matB, eixo: 1, mes_mont: '2024-06', mes_desmont: '2025-06', custo_pneu: 160 },
  ];

  ctx.renderComparacaoReboques(data);

  assert.equal(dom.obter('ran-e1-n-veiculos').textContent, 2);
  assert.equal(dom.obter('ran-e2-n-veiculos').textContent, 1);
  assert.equal(dom.obter('ran-e3-media-frota').textContent, '—', 'nenhum reboque tem Eixo 3 nestes dados');

  const html = dom.obter('ran-veiculos-tbody').innerHTML;
  // 3 linhas por reboque (Eixo 1, 2, 3).
  assert.equal((html.match(new RegExp(matA, 'g')) || []).length, 3);
  assert.equal((html.match(new RegExp(matB, 'g')) || []).length, 3);
  assert.match(html, /Sem dados suficientes/);
});
