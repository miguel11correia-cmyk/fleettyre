// Regressão: o rasto estimado do "Mais urgente" (Por veículo) tinha de
// bater sempre certo com o que a página Alertas mostra para o mesmo
// pneu — calculado só com o histórico do veículo, a taxa de desgaste
// caía quase sempre no valor-padrão fixo (0.08mm/1000km) em vez da
// taxa real observada na frota. Ver README.md > Cálculos > "Taxa de
// desgaste".
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAppScripts } = require('./helpers/load-app-scripts');

test('calcularEstimativasDesgaste — usa a taxa observada na frota, não o fallback fixo, quando há histórico', () => {
  const ctx = loadAppScripts(['js/utils.js', 'js/alertas.js']);

  // Um veículo sem desmontagens próprias (só activo) — sozinho, cairia
  // sempre no fallback 0.08mm/1000km.
  const alvo = { id: 1, matricula: 'AA', posicao: 'Direção Esq', marca: 'MICHELIN', tipo: 'Novo', mes_mont: '2026-01', kms_mont: 400000, custo_pneu: 500, mes_desmont: null };

  // Resto da frota: muito histórico do mesmo marca/tipo/posição, com
  // desgaste real bem mais rápido que o fallback (0.13 mm/1000km).
  const frota = [alvo];
  for (let i = 2; i <= 20; i++) {
    frota.push({ id: i, matricula: 'OUTRO-' + i, posicao: 'Direção Esq', marca: 'MICHELIN', tipo: 'Novo', mes_mont: '2024-01', kms_mont: 0, kms_desmont: 100000, mes_desmont: '2025-01', rasto_final: 3, custo_pneu: 500 });
  }

  const kmAtualPorMat = { AA: 500000 }; // andou 100 000 km

  const soComEsteVeiculo = ctx.calcularEstimativasDesgaste([alvo], kmAtualPorMat);
  const comFrotaToda = ctx.calcularEstimativasDesgaste(frota, kmAtualPorMat).filter(r => r.matricula === 'AA');

  assert.ok(Math.abs(soComEsteVeiculo[0].taxa - 0.08) < 0.001, 'sem histórico próprio, cai no fallback fixo 0.08');
  assert.ok(Math.abs(comFrotaToda[0].taxa - 0.13) < 0.01, 'com a frota toda, usa a taxa real observada (~0.13), não o fallback');
  assert.notEqual(soComEsteVeiculo[0].escEstimada, comFrotaToda[0].escEstimada, 'as duas formas davam valores DIFERENTES — por isso "Mais urgente" tem de usar sempre a frota toda, como o Alertas');
});

test('calcularAlertasReboques (reboques/alertas_r.js) — nível depende do limite do próprio eixo', () => {
  const ctx = loadAppScripts(['js/utils.js', 'js/reboques/alertas_r.js']);
  const hoje = '2026-11';
  const mesesAtras = (n) => {
    const [a, m] = hoje.split('-').map(Number);
    let mm = m - n, aa = a;
    while (mm <= 0) { mm += 12; aa--; }
    return aa + '-' + String(mm).padStart(2, '0');
  };

  // Eixo 1 (limite 12/14): 13 meses -> já "médio". Eixo 2 (limite 20/24):
  // 18 meses -> ainda "ok", apesar de ter mais meses em bruto que o Eixo 1.
  const data = [
    { matricula: 'R1', eixo: 1, mes_mont: mesesAtras(13), mes_desmont: null },
    { matricula: 'R1', eixo: 2, mes_mont: mesesAtras(18), mes_desmont: null },
  ];
  const estimativas = ctx.calcularAlertasReboques(data);
  const eixo1 = estimativas.find(r => r.eixo === 1);
  const eixo2 = estimativas.find(r => r.eixo === 2);

  assert.equal(eixo1.nivel, 'medio');
  assert.equal(eixo2.nivel, 'ok');

  // "Mais urgente" tem de escolher por MARGEM até ao crítico do próprio
  // eixo, não pelos meses em bruto (que favoreceriam erradamente o Eixo 2).
  const comMargem = estimativas.map(r => ({ ...r, margem: r.lim.critico - r.mesesActivo }));
  const maisUrgente = comMargem.reduce((a, b) => (b.margem < a.margem ? b : a));
  assert.equal(maisUrgente.eixo, 1, 'Eixo 1 está mais perto do SEU limite (1 mês de margem) que o Eixo 2 (6 meses de margem), apesar de ter menos meses em bruto');
});
