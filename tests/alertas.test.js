// js/alertas.js — cascata de estimativa da taxa de desgaste e dos KMs
// percorridos (a lógica por trás de calcularEstimativasDesgaste, já
// coberta de ponta a ponta em tests/mais-urgente.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAppScripts } = require('./helpers/load-app-scripts');

test('calcularTaxasPor — agrupa a taxa de desgaste por uma chave à escolha, devolve a média E o nº de registos', () => {
  const ctx = loadAppScripts(['js/utils.js', 'js/alertas.js']);
  const dados = [
    { tipo: 'Novo', kms_mont: 0, kms_desmont: 100000, rasto_final: 3 },  // 0.13
    { tipo: 'Novo', kms_mont: 0, kms_desmont: 50000, rasto_final: 9.5 }, // (16-9.5)/50000*1000 = 0.13
    { tipo: 'Remix', kms_mont: 0, kms_desmont: 50000, rasto_final: 3 },  // (14-3)/50000*1000 = 0.22
  ];
  const porTipo = ctx.calcularTaxasPor(dados, r => r.tipo);
  assert.ok(Math.abs(porTipo.Novo.media - 0.13) < 1e-9);
  assert.equal(porTipo.Novo.n, 2);
  assert.ok(Math.abs(porTipo.Remix.media - 0.22) < 1e-9);
  assert.equal(porTipo.Remix.n, 1);
});

// taxaEstimada deixou de trocar de nível de repente ao encontrar o
// primeiro com 1 registo — cada nível mistura-se com o nível mais
// geral a seguir, pesado por quanto o seu nº de registos se aproxima
// de CREDIBILIDADE_TAXA_DESGASTE (5): poucos registos ainda pesam
// pouco, mais registos aproximam a estimativa da média real desse
// nível. Isto é o que torna a estimativa cada vez mais precisa à
// medida que a app vai acumulando histórico, em vez de poder piorar
// de repente com uma amostra pequena.
test('taxaEstimada — sem dados nenhuns em lado nenhum, cai no fallback fixo do sector (0.08)', () => {
  const ctx = loadAppScripts(['js/utils.js', 'js/alertas.js']);
  const semNada = ctx.taxaEstimada({ marca: 'X', tipo: 'Novo', posicao: 'Direção Esq' }, {}, {}, {}, []);
  assert.equal(semNada, 0.08);
});

test('taxaEstimada — só há média global, e mesmo essa se mistura com o fallback fixo quando tem poucos registos', () => {
  const ctx = loadAppScripts(['js/utils.js', 'js/alertas.js']);
  // (2*0.15 + 5*0.08) / 7 = 0.7/7 = 0.1 -- nem os 0.15 "crus", nem o 0.08 fixo.
  const soGlobal = ctx.taxaEstimada({ marca: 'X', tipo: 'Novo', posicao: 'Direção Esq' }, {}, {}, {}, [0.1, 0.2]);
  assert.ok(Math.abs(soGlobal - 0.1) < 1e-9);
});

test('taxaEstimada — um nível específico com POUCOS registos não domina por completo o nível mais geral (mais fiável)', () => {
  const ctx = loadAppScripts(['js/utils.js', 'js/alertas.js']);

  // Frota toda: 200 registos, média real 0.11. MICHELIN sozinha: só 2
  // registos, média 0.20 (podem ser 2 pneus com desgaste atípico).
  const todasTaxas = Array(200).fill(0.11);
  const taxasPorM = { MICHELIN: { media: 0.20, n: 2 } };

  const resultado = ctx.taxaEstimada({ marca: 'MICHELIN', tipo: 'Novo', posicao: 'Direção Esq' }, {}, {}, taxasPorM, todasTaxas);

  // Nem fica em 0.20 (a versão antiga confiava cegamente nos 2
  // registos), nem cai para perto do fallback fixo de 0.08 (a frota
  // toda já tem bastante história) -- fica num valor intermédio,
  // puxado ligeiramente para a MICHELIN mas sem confiar cegamente nela.
  assert.ok(resultado > 0.08 && resultado < 0.20);
  assert.ok(Math.abs(resultado - 0.135192) < 1e-5, 'valor exacto calculado à mão: ver explicação em README > Cálculos');
});

test('taxaEstimada — quanto MAIS registos um nível específico tiver, mais a estimativa se aproxima da média real desse nível', () => {
  const ctx = loadAppScripts(['js/utils.js', 'js/alertas.js']);
  const todasTaxas = Array(200).fill(0.11);

  const comPoucosRegistos  = ctx.taxaEstimada({ marca: 'MICHELIN', tipo: 'Novo', posicao: 'Direção Esq' }, {}, {}, { MICHELIN: { media: 0.20, n: 2 } },  todasTaxas);
  const comMuitosRegistos  = ctx.taxaEstimada({ marca: 'MICHELIN', tipo: 'Novo', posicao: 'Direção Esq' }, {}, {}, { MICHELIN: { media: 0.20, n: 50 } }, todasTaxas);

  assert.ok(comMuitosRegistos > comPoucosRegistos, 'mais histórico da MICHELIN -> estimativa mais próxima dos 0.20 reais dela');
  assert.ok(Math.abs(comMuitosRegistos - 0.20) < Math.abs(comPoucosRegistos - 0.20), 'com 50 registos está bem mais perto da média real da marca do que com apenas 2');
});

test('taxaEstimada — um ÚNICO registo no nível mais específico (marca+tipo+posição) também não domina, mesmo sobre uma estimativa de marca já fiável', () => {
  const ctx = loadAppScripts(['js/utils.js', 'js/alertas.js']);
  const todasTaxas   = Array(200).fill(0.11);
  const taxasPorM    = { MICHELIN: { media: 0.15, n: 50 } };                // nível de marca, já com bastante confiança
  const taxasPorMTP  = { 'MICHELIN|Novo|Direção': { media: 0.22, n: 1 } };  // só 1 registo nesta combinação exacta

  const resultado = ctx.taxaEstimada({ marca: 'MICHELIN', tipo: 'Novo', posicao: 'Direção Esq' }, taxasPorMTP, {}, taxasPorM, todasTaxas);

  // Puxa ligeiramente para os 0.22, mas fica muito mais perto da
  // estimativa de marca (0.15, já fiável) do que dos 0.22 "crus" de 1 registo só.
  assert.ok(resultado > 0.15 && resultado < 0.22);
  assert.ok(resultado - 0.15 < 0.22 - resultado, 'fica mais perto dos 0.15 (marca, fiável) do que dos 0.22 (1 registo só)');
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
