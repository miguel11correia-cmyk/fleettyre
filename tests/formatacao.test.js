// Formatação partilhada por toda a app (js/utils.js, js/frota.js) —
// separador de milhares sempre a espaço, nunca a depender do locale
// do browser (motivo: toLocaleString('pt-PT') dava resultados
// inconsistentes consoante o motor do browser).
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAppScripts } = require('./helpers/load-app-scripts');

test('fmt — separador de milhares é sempre espaço', () => {
  const ctx = loadAppScripts(['js/utils.js']);
  assert.equal(ctx.fmt(10000), '10 000');
  assert.equal(ctx.fmt(100000), '100 000');
  assert.equal(ctx.fmt(1000000), '1 000 000');
  assert.equal(ctx.fmt(999), '999');
  assert.equal(ctx.fmt(null), '—');
  assert.equal(ctx.fmt(-15000), '-15 000');
});

test('fmtEurKm (frota.js) — formata com símbolo € e travessão para null', () => {
  const ctx = loadAppScripts(['js/utils.js', 'js/alertas.js', 'js/frota.js']);
  assert.equal(ctx.fmtEurKm(0.0236), '€ 0.0236');
  assert.equal(ctx.fmtEurKm(null), '—');
});

test('mesesEntre — diferença de meses entre AAAA-MM', () => {
  const ctx = loadAppScripts(['js/utils.js']);
  assert.equal(ctx.mesesEntre('2026-01', '2026-01'), 0);
  assert.equal(ctx.mesesEntre('2026-01', '2026-11'), 10);
  assert.equal(ctx.mesesEntre('2025-11', '2026-02'), 3);
  assert.equal(ctx.mesesEntre(null, '2026-01'), 0);
});

test('categoriaPosicao — agrupa por família, não pelo lugar exacto', () => {
  const ctx = loadAppScripts(['js/utils.js']);
  assert.equal(ctx.categoriaPosicao('Direção Esq'), 'Direção');
  assert.equal(ctx.categoriaPosicao('Tração Drt Int'), 'Tração');
  assert.equal(ctx.categoriaPosicao('Eixo 2 Esq'), 'Eixo 2');
  assert.equal(ctx.categoriaPosicao(null), null);
});
