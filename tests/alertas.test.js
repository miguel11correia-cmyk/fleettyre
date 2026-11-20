// js/alertas.js — cascata de estimativa da taxa de desgaste e dos KMs
// percorridos (a lógica por trás de calcularEstimativasDesgaste, já
// coberta de ponta a ponta em tests/mais-urgente.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAppScripts } = require('./helpers/load-app-scripts');

test('calcularTaxasPor — agrupa a taxa de desgaste por uma chave à escolha', () => {
  const ctx = loadAppScripts(['js/utils.js', 'js/alertas.js']);
  const dados = [
    { tipo: 'Novo', kms_mont: 0, kms_desmont: 100000, rasto_final: 3 },  // 0.13
    { tipo: 'Novo', kms_mont: 0, kms_desmont: 50000, rasto_final: 9.5 }, // (16-9.5)/50000*1000 = 0.13
    { tipo: 'Remix', kms_mont: 0, kms_desmont: 50000, rasto_final: 3 },  // (14-3)/50000*1000 = 0.22
  ];
  const porTipo = ctx.calcularTaxasPor(dados, r => r.tipo);
  assert.ok(Math.abs(porTipo.Novo - 0.13) < 1e-9);
  assert.ok(Math.abs(porTipo.Remix - 0.22) < 1e-9);
});

test('taxaEstimada — cascata marca+tipo+posição → marca+tipo → marca → média global → 0.08 fixo', () => {
  const ctx = loadAppScripts(['js/utils.js', 'js/alertas.js']);

  // Nenhuma taxa conhecida nenhuma -> cai no fallback fixo do sector.
  const semNada = ctx.taxaEstimada({ marca: 'X', tipo: 'Novo', posicao: 'Direção Esq' }, {}, {}, {}, []);
  assert.equal(semNada, 0.08);

  // Só há média global -> usa-a.
  const soGlobal = ctx.taxaEstimada({ marca: 'X', tipo: 'Novo', posicao: 'Direção Esq' }, {}, {}, {}, [0.1, 0.2]);
  assert.ok(Math.abs(soGlobal - 0.15) < 1e-9);

  // Há taxa por marca -> prefere-a à média global.
  const porMarca = ctx.taxaEstimada({ marca: 'MICHELIN', tipo: 'Novo', posicao: 'Direção Esq' }, {}, {}, { MICHELIN: 0.3 }, [0.1]);
  assert.equal(porMarca, 0.3);

  // Há taxa por marca+tipo -> prefere-a à de só-marca.
  const porMarcaTipo = ctx.taxaEstimada(
    { marca: 'MICHELIN', tipo: 'Novo', posicao: 'Direção Esq' },
    {}, { 'MICHELIN|Novo': 0.4 }, { MICHELIN: 0.3 }, [0.1]
  );
  assert.equal(porMarcaTipo, 0.4);

  // Há taxa por marca+tipo+posição -> é a mais específica, ganha a todas.
  const maisEspecifica = ctx.taxaEstimada(
    { marca: 'MICHELIN', tipo: 'Novo', posicao: 'Direção Esq' },
    { 'MICHELIN|Novo|Direção': 0.5 }, { 'MICHELIN|Novo': 0.4 }, { MICHELIN: 0.3 }, [0.1]
  );
  assert.equal(maisEspecifica, 0.5);
});

test('kmsReaisOuEstimados — cascata: telemetria real > KMs máx. conhecidos > média mensal > 7500km/mês fixo', () => {
  const ctx = loadAppScripts(['js/utils.js', 'js/alertas.js']);

  // 1) Telemetria real disponível e maior que kms_mont -> usa-a sempre primeiro.
  const comTelemetria = ctx.kmsReaisOuEstimados({ kms_mont: 1000, mes_mont: '2026-01' }, [], 9000);
  assert.equal(comTelemetria, 8000);

  // 2) Sem telemetria, mas outro pneu do mesmo camião já reporta mais KMs -> usa esse mínimo garantido.
  const comKmsMax = ctx.kmsReaisOuEstimados(
    { kms_mont: 1000, mes_mont: '2026-01' },
    [{ kms_mont: 1000 }, { kms_mont: 50000 }],
    null
  );
  assert.equal(comKmsMax, 49000);

  // 3) Sem nenhum dos dois, mas há pelo menos 2 montagens passadas para estimar uma média mensal.
  const comMediaMensal = ctx.kmsReaisOuEstimados(
    { kms_mont: 20000, mes_mont: '2026-06' }, // pneu mais recente deste camião
    [
      { kms_mont: 0, mes_mont: '2025-01' },
      { kms_mont: 10000, mes_mont: '2025-06' }, // 10 000km em 5 meses = 2000km/mês
    ],
    null
  );
  assert.ok(comMediaMensal > 0, 'estimou algo a partir da média mensal, não caiu logo no fallback fixo');

  // 4) Sem nenhum dado -> fallback fixo de 7500km/mês.
  const semDados = ctx.kmsReaisOuEstimados({ kms_mont: 0, mes_mont: ctx.mesAtual() }, [], null);
  assert.equal(semDados, 0, '0 meses desde a montagem até agora -> 0 km estimados');
});

test('nivelDesgaste — crítico ≤3mm, médio ≤5mm, ok acima disso', () => {
  const ctx = loadAppScripts(['js/utils.js', 'js/alertas.js']);
  assert.equal(ctx.nivelDesgaste(2), 'critico');
  assert.equal(ctx.nivelDesgaste(3), 'critico');
  assert.equal(ctx.nivelDesgaste(4), 'medio');
  assert.equal(ctx.nivelDesgaste(5), 'medio');
  assert.equal(ctx.nivelDesgaste(6), 'ok');
});
