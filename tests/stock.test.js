// js/stock.js — só a parte pura de agregação/formatação (loadStock,
// abrirSelStock, procurarPneusAlocar, etc. são async/Supabase-
// coupled, fora do âmbito destes testes): agrupar pendentes por
// destino, calcular a duração (km em veículos, meses em reboques) dos
// já prontos, e o resumo/tecto de resultados da pesquisa de alocação.
//
// listaFornecedores é um `let` de compras.js, referenciado directamente
// (sem `typeof`) dentro de renderStockDesmontados — por isso tem de
// vir carregado (ou passado como global inicial) para não dar
// ReferenceError, tal como no app.html real (compras.js carrega antes
// de stock.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAppScripts } = require('./helpers/load-app-scripts');
const { criarDomStub } = require('./helpers/dom-stub');

function carregar(document) {
  return loadAppScripts(['js/utils.js', 'js/compras.js', 'js/pdf-anexo.js', 'js/stock.js'], { document });
}

test('renderStockDesmontados — agrupa pendentes por destino (cartão com contagem), destinos sem nada mostram "Nada pendente"', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom.document);

  const pneus = [
    { id: 1, matricula: 'AA-00-AA', destino: 'Remix', pronto: false, posicao: 'Direção Esq' },
    { id: 2, matricula: 'BB-00-BB', destino: 'Remix', pronto: false, posicao: 'Tração Esq Int' },
    { id: 3, matricula: 'CC-00-CC', destino: 'Stock', pronto: false, posicao: 'Direção Drt' },
  ];
  ctx.renderStockDesmontados(pneus, 'pneus');

  const html = dom.obter('stock-destinos-container').innerHTML;
  assert.match(html, /Remix[\s\S]*?>2</, 'cartão Remix mostra 2 pendentes');
  assert.match(html, /Rechapar[\s\S]*?Nada pendente/, 'Rechapar não tem nenhum pendente');
  assert.match(html, /Abrir Piso[\s\S]*?Nada pendente/);
});

test('renderStockDesmontados — duração dos já prontos é em KM (veículos, kms_desmont-kms_mont) ou em meses (reboques, mesesEntre)', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom.document);

  const pneus = [
    { id: 10, matricula: 'AA-00-AA', destino: 'Rechapar', pronto: true, kms_mont: 10000, kms_desmont: 90000, mes_desmont: '2026-01' },
  ];
  ctx.renderStockDesmontados(pneus, 'pneus');
  assert.match(dom.obter('stock-prontos-container').innerHTML, /80 000 km/, 'veículo: 90000-10000=80000, formatado com espaço de milhares');

  const dom2 = criarDomStub();
  const ctx2 = carregar(dom2.document);
  const reboques = [
    { id: 20, matricula: 'R-01', destino: 'Rechapar', pronto: true, mes_mont: '2024-01', mes_desmont: '2025-01' },
  ];
  ctx2.renderStockDesmontados(reboques, 'reboques');
  assert.match(dom2.obter('stock-prontos-container').innerHTML, /12 meses/, 'reboque: duração vem de mesesEntre, não de KMs');
});

test('renderStockDesmontados — sem nenhum pneu pronto, mostra a mensagem vazia', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom.document);
  ctx.renderStockDesmontados([{ id: 1, matricula: 'AA-00-AA', destino: 'Stock', pronto: false }], 'pneus');
  assert.match(dom.obter('stock-prontos-container').innerHTML, /Nenhum pneu pronto a montar/);
});

test('renderAlocResultados — mostra o resumo normal, ou o aviso de tecto quando atinge o limite de 300 resultados', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom.document);

  const vm = require('node:vm');
  vm.runInContext(
    'globalThis.__setAloc = (r, s) => { alocResultados = r; alocSelecionados = s; };',
    ctx
  );

  const umPneu = [{ id: 1, matricula: 'AA-00-AA', marca: 'MICHELIN', tipo: 'Novo', mes_mont: '2026-01', custo_pneu: 0 }];
  ctx.__setAloc(umPneu, new Set());
  ctx.renderAlocResultados();
  let html = dom.obter('alo-resultados').innerHTML;
  assert.match(html, /1 pneu encontrado/);
  assert.doesNotMatch(html, /mais recentes/, 'abaixo do tecto, sem aviso de limite');
  assert.match(html, /disabled/, 'nenhum seleccionado -> botão de aplicar desactivado');

  const trezentos = Array.from({ length: 300 }, (_, i) => ({ id: i, matricula: 'X-' + i, marca: 'M', tipo: 'Novo', mes_mont: '2026-01' }));
  ctx.__setAloc(trezentos, new Set([0, 1]));
  ctx.renderAlocResultados();
  html = dom.obter('alo-resultados').innerHTML;
  assert.match(html, /300\+ pneus encontrados[\s\S]*?mais recentes/, 'no tecto exacto, mostra o aviso de limite');
  assert.doesNotMatch(html, />2<\s*disabled|disabled[\s\S]*?>2</, 'com 2 seleccionados, o botão não fica desactivado');
});

test('renderAlocResultados — sem resultados, mostra a mensagem vazia', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom.document);
  const vm = require('node:vm');
  vm.runInContext('globalThis.__setAloc = (r, s) => { alocResultados = r; alocSelecionados = s; };', ctx);
  ctx.__setAloc([], new Set());
  ctx.renderAlocResultados();
  assert.match(dom.obter('alo-resultados').innerHTML, /Nenhum pneu montado corresponde/);
});
