// js/inicio.js — KPIs e tabelas da "Visão geral" do Início (loadInicio
// é async/Supabase-coupled, fora do âmbito). mkChart (utils.js) chama
// `new Chart(...)` e, para barras com `topLabels`, também manipula
// `canvas.parentElement` (prepararCanvasBarras) — nada disto existe
// fora do browser, por isso aqui simula-se com o mínimo indispensável:
// um `Chart` stub que não faz nada, e um `parentElement` fake só nos
// canvas que passam por esse caminho (c-tipo/c-forn/c-marc, sempre
// chamados com topLabels:true). charts/CHART_NEUTRAL são globais
// `const` de config.js (que não carrega fora do browser — ver nota em
// utils.test.js/SLOTS_VEICULO) — aqui entram como globais iniciais do
// sandbox, resolvidos da mesma forma que listaFornecedores em
// stock.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadAppScripts } = require('./helpers/load-app-scripts');
const { criarDomStub } = require('./helpers/dom-stub');

function containerFakeStub() {
  const set = new Set();
  return {
    classList: {
      contains: c => set.has(c),
      add: (...cs) => cs.forEach(c => set.add(c)),
      remove: (...cs) => cs.forEach(c => set.delete(c)),
      toggle(c, f) { const on = f === undefined ? !set.has(c) : f; if (on) set.add(c); else set.delete(c); return on; },
    },
    insertBefore() {},
    appendChild() {},
  };
}

function carregar(dom) {
  const ctx = loadAppScripts(['js/utils.js', 'js/inicio.js'], {
    document: dom.document,
    CHART_NEUTRAL: '#5B6770',
    charts: {},
    Chart: class { constructor() {} destroy() {} },
  });
  vm.runInContext(
    'globalThis.__setInicio = (dv, dr, alertas) => { inicioDadosVeic = dv; inicioDadosReb = dr; if (alertas) inicioAlertasCount = alertas; };',
    ctx
  );
  ['c-tipo', 'c-forn', 'c-marc'].forEach(id => { dom.obter(id).parentElement = containerFakeStub(); });
  return ctx;
}

test('renderInicioVista — vista "veiculos": KPIs só dos pneus, custo médio é a média dos que têm custo, painel de posição/eixo fica visível', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom);

  const pneus = [
    { matricula: 'AA-00-AA', tipo: 'Novo', mes_mont: '2026-01', custo_pneu: 100 },
    { matricula: 'AA-00-AA', tipo: 'Novo', mes_mont: '2026-01', custo_pneu: 300 },
    { matricula: 'BB-00-BB', tipo: 'Remix', mes_mont: '2026-02', custo_pneu: null, mes_desmont: '2026-03' }, // sem custo, já desmontado
  ];
  ctx.__setInicio({ pneus, veiculos: [] }, { reboques: [] }, { veic: 2, reb: 0 });
  ctx.escolherVistaInicio('veiculos');

  assert.equal(dom.obter('k-total').textContent, 3);
  assert.equal(dom.obter('k-activos').textContent, 2, 'só 2 estão activos (1 já desmontado)');
  assert.equal(dom.obter('k-mats').textContent, 2, '2 matrículas distintas');
  assert.equal(dom.obter('k-alerts').textContent, 2);
  assert.equal(dom.obter('k-custo').textContent, '€ 400,00', 'soma dos 2 com custo (100+300), o 3º fica de fora');
  assert.equal(dom.obter('k-med').textContent, '€ 200,00', 'média é 400/2, não 400/3');

  assert.equal(dom.obter('inicio-analise-pos').classList.contains('hidden'), false, 'em vista individual, o painel de posição/eixo aparece');
});

test('renderInicioVista — vista "unificada": junta pneus + reboques, mas o painel de posição/eixo fica escondido (não combinável)', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom);

  const pneus    = [{ matricula: 'AA-00-AA', tipo: 'Novo', mes_mont: '2026-01', custo_pneu: 100 }];
  const reboques = [{ matricula: 'R-01', tipo: 'Novo', mes_mont: '2026-01', custo_pneu: 200 }];
  ctx.__setInicio({ pneus, veiculos: [] }, { reboques }, { veic: 1, reb: 1 });
  ctx.escolherVistaInicio('unificada');

  assert.equal(dom.obter('k-total').textContent, 2);
  assert.equal(dom.obter('k-alerts').textContent, 2, 'soma os críticos de veículos e reboques');
  assert.equal(dom.obter('inicio-analise-pos').classList.contains('hidden'), true, 'vista unificada não mostra análise por posição/eixo');
});

test('renderInicioVista — tabela anual: agrupa por ano, custo médio só considera registos com custo', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom);

  const pneus = [
    { matricula: 'A', tipo: 'Novo', mes_mont: '2025-03', custo_pneu: 100 },
    { matricula: 'B', tipo: 'Novo', mes_mont: '2025-06', custo_pneu: null },
    { matricula: 'C', tipo: 'Novo', mes_mont: '2026-01', custo_pneu: 300 },
  ];
  ctx.__setInicio({ pneus, veiculos: [] }, { reboques: [] }, {});
  ctx.escolherVistaInicio('veiculos');

  const html = dom.obter('tabela-anual-tbody').innerHTML;
  // 2025: 2 pneus, custo 100 (só 1 com custo -> média 100,00, não 50).
  assert.match(html, /2025[\s\S]*?>2<[\s\S]*?€ 100,00[\s\S]*?€ 100,00/);
  // Ordenado do ano mais recente para o mais antigo.
  assert.ok(html.indexOf('2026') < html.indexOf('2025'));
});

test('renderInicioAnalisePosicao — Direção e Tração aparecem sempre primeiro (ordem fixa), só entram registos com rasto final completo', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom);

  const pneus = [
    { tipo: 'Novo', posicao: 'Direção Esq', kms_mont: 0, kms_desmont: 100000, rasto_final: 3 },  // taxa 0.13
    { tipo: 'Novo', posicao: 'Tração Esq Int', kms_mont: 0, kms_desmont: 50000, rasto_final: 10 }, // taxa (16-10)/50000*1000 = 0.12
    { tipo: 'Novo', posicao: 'Direção Drt', kms_mont: 0, kms_desmont: null, rasto_final: null }, // ainda montado, ignorado
  ];
  ctx.renderInicioAnalisePosicao(pneus);

  const html = dom.obter('desgaste-pos-tbody').innerHTML;
  assert.ok(html.indexOf('Direção') < html.indexOf('Tração'), 'Direção sempre antes de Tração, independentemente da ordem dos dados');
  assert.match(html, />1</, 'só 1 registo por posição entrou (o terceiro, sem rasto final, foi ignorado)');
});

test('renderInicioAnaliseEixo — Eixo 1/2/3 em ordem fixa, duração calculada por mesesEntre, só desmontagens completas', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom);

  const reboques = [
    { eixo: 2, mes_mont: '2023-01', mes_desmont: '2025-01' }, // 24 meses
    { eixo: 1, mes_mont: '2024-01', mes_desmont: '2025-01' }, // 12 meses
    { eixo: 3, mes_mont: '2026-01', mes_desmont: null },      // ainda montado, ignorado
  ];
  ctx.renderInicioAnaliseEixo(reboques);

  const html = dom.obter('desgaste-pos-tbody').innerHTML;
  assert.ok(html.indexOf('Eixo 1') < html.indexOf('Eixo 2'), 'ordem fixa 1 -> 2 -> 3, não a ordem de chegada dos dados');
  assert.match(html, /Eixo 1[\s\S]*?12/);
  assert.match(html, /Eixo 2[\s\S]*?24/);
  assert.doesNotMatch(html, /Eixo 3/, 'Eixo 3 não entra: a única linha dele ainda está montada');
});
