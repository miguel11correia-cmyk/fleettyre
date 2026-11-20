// Regressão: €/km (e €/mês nos reboques) tinha de usar o custo MÉDIO
// por pneu da categoria, não a soma — somar inflacionava sempre o
// rácio de quem tem mais pneus na categoria (Tração tem o dobro de
// Direção), mesmo quando cada pneu individual é mais barato por km.
// Ver README.md > Cálculos > "Custo por km (por veículo)".
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAppScripts } = require('./helpers/load-app-scripts');

test('eurKmPorCategoria (frota.js) — Tração mais barata não pode aparecer mais cara que Direção', () => {
  const ctx = loadAppScripts(['js/utils.js', 'js/alertas.js', 'js/frota.js']);

  // Caso real que motivou a correção: 2 pneus de Direção caros, 4 de
  // Tração mais baratos cada, todos com o mesmo kms_mont/kmAtual (logo
  // o mesmo KMs efectuados individual).
  const kmsMont = 215099;
  const kmAtual = kmsMont + 28043;
  const base = { mes_mont: '2026-08', kms_mont: kmsMont, mes_desmont: null, marca: 'MICHELIN' };
  const data = [
    { ...base, id: 1, posicao: 'Direção Esq', tipo: 'Novo', custo_pneu: 662.76 },
    { ...base, id: 2, posicao: 'Direção Drt', tipo: 'Novo', custo_pneu: 662.76 },
    { ...base, id: 3, posicao: 'Tração Esq Int', tipo: 'Remix', custo_pneu: 428.07 },
    { ...base, id: 4, posicao: 'Tração Esq Ext', tipo: 'Remix', custo_pneu: 428.07 },
    { ...base, id: 5, posicao: 'Tração Drt Int', tipo: 'Remix', custo_pneu: 428.07 },
    { ...base, id: 6, posicao: 'Tração Drt Ext', tipo: 'Remix', custo_pneu: 428.07 },
  ];

  const eurKmDir = ctx.eurKmPorCategoria(data, data, 'Direção', kmAtual);
  const eurKmTra = ctx.eurKmPorCategoria(data, data, 'Tração', kmAtual);

  assert.ok(eurKmTra < eurKmDir, `Tração (${eurKmTra}) devia ser mais barata que Direção (${eurKmDir}) — pneus mais baratos, mesmos KMs`);
  assert.ok(Math.abs(eurKmDir - 662.76 / 28043) < 1e-9, 'Direção: custo MÉDIO (662.76), não a soma dos 2 pneus');
  assert.ok(Math.abs(eurKmTra - 428.07 / 28043) < 1e-9, 'Tração: custo MÉDIO (428.07), não a soma dos 4 pneus');
});

test('eurKmPorCategoria — sem pneus activos na categoria devolve null (mostra travessão na UI)', () => {
  const ctx = loadAppScripts(['js/utils.js', 'js/alertas.js', 'js/frota.js']);
  const data = [{ posicao: 'Direção Esq', marca: 'X', tipo: 'Novo', mes_mont: '2026-01', kms_mont: 1000, custo_pneu: 100, mes_desmont: null }];
  assert.equal(ctx.eurKmPorCategoria(data, data, 'Tração', 5000), null);
});

test('calcularComparacaoCategoria (analytics.js) — mesma correção na página Análise', () => {
  const ctx = loadAppScripts(['js/utils.js', 'js/alertas.js', 'js/analytics.js']);
  const mat = 'AA-00-AA';
  const base = { matricula: mat, mes_mont: '2026-01', kms_mont: 100000, mes_desmont: null, marca: 'MICHELIN' };
  const data = [
    { ...base, id: 1, posicao: 'Direção Esq', custo_pneu: 500 },
    { ...base, id: 2, posicao: 'Direção Drt', custo_pneu: 500 },
    { ...base, id: 3, posicao: 'Tração Esq Int', custo_pneu: 300 },
    { ...base, id: 4, posicao: 'Tração Esq Ext', custo_pneu: 300 },
  ];
  const kmAtualPorMat = { [mat]: 150000 };

  const dir = ctx.calcularComparacaoCategoria(data, kmAtualPorMat, 'Direção');
  const tra = ctx.calcularComparacaoCategoria(data, kmAtualPorMat, 'Tração');

  assert.equal(dir.linhas.length, 1);
  assert.equal(tra.linhas.length, 1);
  assert.ok(tra.linhas[0].eurKm < dir.linhas[0].eurKm, 'Tração (pneus mais baratos) tem de sair mais barata por km que Direção');
});

test('eurMesPorEixo (reboques/frota_r.js) — mesma correção para reboques', () => {
  const ctx = loadAppScripts(['js/utils.js', 'js/reboques/frota_r.js']);
  const hoje = '2026-11';
  const ativos = [
    { eixo: 1, mes_mont: '2026-01', custo_pneu: 200 },
    { eixo: 1, mes_mont: '2026-01', custo_pneu: 200 },
    { eixo: 2, mes_mont: '2026-01', custo_pneu: 150 },
    { eixo: 2, mes_mont: '2026-01', custo_pneu: 150 },
    { eixo: 2, mes_mont: '2026-01', custo_pneu: 150 },
    { eixo: 2, mes_mont: '2026-01', custo_pneu: 150 },
  ];
  const e1 = ctx.eurMesPorEixo(ativos, 1, hoje);
  const e2 = ctx.eurMesPorEixo(ativos, 2, hoje);
  // Eixo 2 tem o dobro dos pneus (rodado duplo) mas cada um é mais
  // barato — tem de sair mais barato por mês, não mais caro.
  const paraNumero = (texto) => Number(texto.replace('€', '').replace(',', '.').trim());
  assert.ok(paraNumero(e2) < paraNumero(e1), `Eixo 2 (${e2}) devia ser mais barato que Eixo 1 (${e1})`);
});
