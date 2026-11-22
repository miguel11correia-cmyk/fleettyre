// js/compras.js — comparação de preços entre fornecedores (lógica
// anti-erosão: a percentagem compara sempre contra o fornecedor mais
// barato actual, nunca contra uma média histórica combinada) e o
// detalhe de desempenho por marca/modelo/tipo.
//
// fornDadosVeic/fornDadosReb são `let` de topo em compras.js — não
// ficam expostos como propriedades do sandbox (mesma razão de
// SLOTS_VEICULO em utils.test.js), por isso não há como atribuir-lhes
// valores de fora directamente. Em vez de alterar o ficheiro de
// produção para os expor, usa-se aqui o próprio motor `vm`: uma
// segunda execução no MESMO contexto define uma função que, por
// closure, continua a ver essas variáveis — e essa função fica
// acessível de fora porque é atribuída directamente ao objecto global
// (sandbox), não declarada com let/const.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadAppScripts } = require('./helpers/load-app-scripts');
const { criarDomStub } = require('./helpers/dom-stub');

function carregar(document) {
  const ctx = loadAppScripts(['js/utils.js', 'js/compras.js'], { document });
  vm.runInContext(
    'globalThis.__setDadosCompras = (veic, reb) => { fornDadosVeic = veic; fornDadosReb = reb; };' +
    'globalThis.__setAloc = (r, s) => { alocResultados = r; alocSelecionados = s; };',
    ctx
  );
  return ctx;
}

test('renderComparacaoFornecedores — percentagem compara sempre contra o fornecedor mais barato actual, nunca contra a média histórica combinada', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom.document);

  // Fornecedor A (mais barato, 2 compras a 100) vs Fornecedor B (2
  // compras a 200). Média combinada de todas as 4 compras = 150 — se a
  // percentagem fosse calculada contra essa média (o bug que esta
  // lógica evita), B apareceria a +33%, não a +100%, e A apareceria
  // com percentagem negativa em vez de "mais barato".
  const dados = [
    { marca: 'MICHELIN', subtipo: 'XZE2', tipo: 'Novo', fornecedor: 'FORN A', custo_pneu: 100 },
    { marca: 'MICHELIN', subtipo: 'XZE2', tipo: 'Novo', fornecedor: 'FORN A', custo_pneu: 100 },
    { marca: 'MICHELIN', subtipo: 'XZE2', tipo: 'Novo', fornecedor: 'FORN B', custo_pneu: 200 },
    { marca: 'MICHELIN', subtipo: 'XZE2', tipo: 'Novo', fornecedor: 'FORN B', custo_pneu: 200 },
  ];
  ctx.__setDadosCompras(dados, []);
  ctx.escolherMarcaComparacaoFornecedores('MICHELIN');

  const html = dom.obter('forn-cmp-resultado').innerHTML;
  assert.match(html, /mais barato/, 'o fornecedor mais barato não compara contra nada, é a referência');
  assert.match(html, /\+100%/, 'B é o dobro de A -> +100%, não +33% (que daria uma média combinada)');
  assert.doesNotMatch(html, /\+33%/);
});

test('renderComparacaoFornecedores — ignora fornecedor PARQUE e registos sem custo, filtra por tipo quando escolhido', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom.document);

  const dados = [
    { marca: 'BRIDGESTONE', subtipo: 'M729', tipo: 'Novo', fornecedor: 'FORN A', custo_pneu: 100 },
    { marca: 'BRIDGESTONE', subtipo: 'M729', tipo: 'Novo', fornecedor: 'PARQUE', custo_pneu: 50 }, // ignorado (não é fornecedor real)
    { marca: 'BRIDGESTONE', subtipo: 'M729', tipo: 'Novo', fornecedor: 'FORN B', custo_pneu: null }, // ignorado (sem custo)
    { marca: 'BRIDGESTONE', subtipo: 'M729', tipo: 'Remix', fornecedor: 'FORN C', custo_pneu: 60 }, // outro tipo
  ];
  ctx.__setDadosCompras(dados, []);
  ctx.escolherMarcaComparacaoFornecedores('BRIDGESTONE');

  let html = dom.obter('forn-cmp-resultado').innerHTML;
  assert.match(html, /FORN A/);
  assert.doesNotMatch(html, /PARQUE/);
  assert.doesNotMatch(html, /FORN B/);
  assert.match(html, /FORN C/, 'sem filtro de tipo, mostra os dois tipos');

  ctx.escolherTipoComparacaoFornecedores('Novo');
  html = dom.obter('forn-cmp-resultado').innerHTML;
  assert.match(html, /FORN A/);
  assert.doesNotMatch(html, /FORN C/, 'com o filtro "Novo", o registo Remix desaparece');
});

test('renderDesempenhoMarcas — eficiência é €/1000km em veículos (odómetro), €/mês em reboques (duração), e ausente na vista unificada', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom.document);

  const veic = [
    { marca: 'MICHELIN', subtipo: 'XZE2', tipo: 'Novo', mes_desmont: '2026-01', kms_mont: 0, kms_desmont: 100000, custo_pneu: 500 },
  ];
  const reb = [
    { marca: 'MICHELIN', subtipo: 'XZE2', tipo: 'Novo', mes_mont: '2024-01', mes_desmont: '2025-01', custo_pneu: 240 }, // 12 meses
  ];
  ctx.__setDadosCompras(veic, reb);

  ctx.escolherVistaCompras('veiculos');
  let thead = dom.obter('marc-thead').innerHTML;
  assert.match(thead, /€\/1000km/);
  let tbody = dom.obter('marc-tbody').innerHTML;
  assert.match(tbody, /MICHELIN/);

  ctx.escolherVistaCompras('reboques');
  thead = dom.obter('marc-thead').innerHTML;
  assert.match(thead, /€\/mês/);
  assert.doesNotMatch(thead, /€\/1000km/);

  ctx.escolherVistaCompras('unificada');
  thead = dom.obter('marc-thead').innerHTML;
  assert.doesNotMatch(thead, /€\/1000km|€\/mês/, 'eficiência de km e de meses não são combináveis, por isso a vista unificada não mostra nenhuma');
  tbody = dom.obter('marc-tbody').innerHTML;
  // Mesma marca+modelo+tipo em ambos -> uma só linha agregada (não uma
  // por registo), mas com os 2 registos (1 veículo + 1 reboque) juntos.
  assert.equal((tbody.match(/MICHELIN/g) || []).length, 1);
  assert.match(tbody, />2</, 'os 2 registos (veículo + reboque) ficam juntos na mesma linha agregada');
});

test('registosCompletosVeiculos/Reboques — só entram registos desmontados com toda a informação (sem eles, a mensagem de "sem registos" aparece)', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom.document);

  const veic = [
    { marca: 'MICHELIN', subtipo: 'X', tipo: 'Novo', mes_desmont: null, kms_mont: 0, kms_desmont: null, custo_pneu: 500 }, // ainda montado
    { marca: 'MICHELIN', subtipo: 'X', tipo: 'Novo', mes_desmont: '2026-01', kms_mont: 1000, kms_desmont: 500, custo_pneu: 500 }, // kms_desmont < kms_mont
  ];
  ctx.__setDadosCompras(veic, []);
  ctx.escolherVistaCompras('veiculos');

  const tbody = dom.obter('marc-tbody').innerHTML;
  assert.match(tbody, /Sem registos desmontados/);
});

// "Atribuir preço de fatura antiga a pneus já montados" — mudou-se de
// stock.js para aqui (não é stock, é atribuição de custo a pneus já
// activos). alocTipo substitui o antigo stockContexto (ver
// escolherTipoAlocacao), para decidir se a pesquisa é à tabela
// 'pneus' ou 'reboques'.
test('renderAlocResultados — mostra o resumo normal, ou o aviso de tecto quando atinge o limite de 300 resultados', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom.document);

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
  ctx.__setAloc([], new Set());
  ctx.renderAlocResultados();
  assert.match(dom.obter('alo-resultados').innerHTML, /Nenhum pneu montado corresponde/);
});

test('escolherTipoAlocacao — trocar de Camiões para Reboques limpa a pesquisa anterior (evita aplicar a um resultado da tabela errada)', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom.document);
  ctx.__setAloc([{ id: 1, matricula: 'AA' }], new Set([1]));
  ctx.renderAlocResultados();
  assert.match(dom.obter('alo-resultados').innerHTML, /1 pneu encontrado/);

  ctx.escolherTipoAlocacao('reboques');
  assert.equal(dom.obter('alo-resultados').innerHTML, '', 'cancelarAlocacao esvazia os resultados ao trocar de tipo');
});
