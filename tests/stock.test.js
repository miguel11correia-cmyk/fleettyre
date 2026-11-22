// js/stock.js — só a parte pura de agregação/formatação (loadStock faz
// o fetch ao Supabase, fora do âmbito; renderStockVista é a parte pura
// a seguir, chamada por loadStock() depois de ter os dados): juntar/
// separar veículos e reboques consoante a "Visão geral" escolhida
// (igual a compras.js/inicio.js), agrupar pendentes por destino, e
// calcular a duração (km em veículos, meses em reboques) dos já
// prontos. A pesquisa "Atribuir preço de fatura antiga" mudou-se para
// compras.js (não é stock) — ver tests/compras.test.js.
//
// listaFornecedores é um `let` de compras.js, referenciado directamente
// dentro de renderStockDesmontados — por isso carrega-se compras.js
// também, tal como no app.html real.
//
// stockFaturasVeic/Reb e stockDesmontadosVeic/Reb são `let`s de topo
// de stock.js — não ficam expostos como propriedades do sandbox
// (mesma razão de SLOTS_VEICULO em utils.test.js), por isso usa-se o
// mesmo truque de globalThis.__set... de compras.test.js/inicio.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadAppScripts } = require('./helpers/load-app-scripts');
const { criarDomStub } = require('./helpers/dom-stub');

function carregar(document) {
  const ctx = loadAppScripts(['js/utils.js', 'js/frota.js', 'js/compras.js', 'js/pdf-anexo.js', 'js/reboques/frota_r.js', 'js/stock.js'], { document });
  vm.runInContext(
    'globalThis.__setStockDados = (fV, fR, dV, dR) => { stockFaturasVeic = fV; stockFaturasReb = fR; stockDesmontadosVeic = dV; stockDesmontadosReb = dR; };',
    ctx
  );
  return ctx;
}

test('renderStockDesmontados — agrupa pendentes por destino (cartão com contagem), destinos sem nada mostram "Nada pendente"', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom.document);

  const pneus = [
    { id: 1, matricula: 'AA-00-AA', destino: 'Remix', pronto: false, posicao: 'Direção Esq', _tabela: 'pneus' },
    { id: 2, matricula: 'BB-00-BB', destino: 'Remix', pronto: false, posicao: 'Tração Esq Int', _tabela: 'pneus' },
    { id: 3, matricula: 'CC-00-CC', destino: 'Stock', pronto: false, posicao: 'Direção Drt', _tabela: 'pneus' },
  ];
  ctx.renderStockDesmontados(pneus);

  const html = dom.obter('stock-destinos-container').innerHTML;
  assert.match(html, /Remix[\s\S]*?>2</, 'cartão Remix mostra 2 pendentes');
  assert.match(html, /Rechapar[\s\S]*?Nada pendente/, 'Rechapar não tem nenhum pendente');
  assert.match(html, /Abrir Piso[\s\S]*?Nada pendente/);
});

test('renderStockDesmontados — duração dos já prontos vem da própria linha (_tabela): KM para veículos, meses para reboques, mesmo misturados na mesma lista', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom.document);

  const pneus = [
    { id: 10, matricula: 'AA-00-AA', destino: 'Rechapar', pronto: true, kms_mont: 10000, kms_desmont: 90000, mes_desmont: '2026-01', _tabela: 'pneus' },
    { id: 20, matricula: 'R-01', destino: 'Rechapar', pronto: true, mes_mont: '2024-01', mes_desmont: '2025-01', _tabela: 'reboques' },
  ];
  ctx.renderStockDesmontados(pneus);
  const html = dom.obter('stock-prontos-container').innerHTML;
  assert.match(html, /80 000 km/, 'veículo: 90000-10000=80000, formatado com espaço de milhares');
  assert.match(html, /12 meses/, 'reboque: duração vem de mesesEntre, não de KMs, na MESMA tabela (vista unificada)');
});

test('renderStockDesmontados — sem nenhum pneu pronto, mostra a mensagem vazia', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom.document);
  ctx.renderStockDesmontados([{ id: 1, matricula: 'AA-00-AA', destino: 'Stock', pronto: false, _tabela: 'pneus' }]);
  assert.match(dom.obter('stock-prontos-container').innerHTML, /Nenhum pneu pronto a montar/);
});

test('renderStockVista — vista "veiculos": KPIs só das faturas/desmontados de veículos', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom.document);

  const faturaV = { id: 1, contexto: 'veiculos', num_fatura: 'FT-V', fornecedor: 'FORN', stock_linhas: [{ quantidade_disp: 4, quantidade_ini: 4, preco_unitario: 100, marca: 'M', subtipo: 'S', medida: '295/80', tipo: 'Novo' }] };
  const faturaR = { id: 2, contexto: 'reboques', num_fatura: 'FT-R', fornecedor: 'FORN', stock_linhas: [{ quantidade_disp: 2, quantidade_ini: 2, preco_unitario: 200, marca: 'M', subtipo: 'S', medida: '385/65', tipo: 'Novo' }] };
  ctx.__setStockDados([faturaV], [faturaR], [{ id: 10, matricula: 'AA', destino: 'Stock', pronto: false }], [{ id: 20, matricula: 'R1', destino: 'Stock', pronto: false }]);

  ctx.escolherVistaStock('veiculos');
  assert.equal(dom.obter('sk-faturas').textContent, 1);
  assert.equal(dom.obter('sk-pneus').textContent, 4 + 1, '4 pneus da fatura de veículos + 1 desmontado de veículos');
  assert.equal(dom.obter('sk-valor').textContent, '€ 400,00', 'só a fatura de veículos (4 x 100), não a de reboques');
});

test('renderStockVista — vista "unificada": combina faturas/desmontados de veículos e reboques, e identifica cada fatura com um selo de tipo', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom.document);

  const faturaV = { id: 1, contexto: 'veiculos', num_fatura: 'FT-V', fornecedor: 'FORN', stock_linhas: [{ quantidade_disp: 4, quantidade_ini: 4, preco_unitario: 100, marca: 'M', subtipo: 'S', medida: '295/80', tipo: 'Novo' }] };
  const faturaR = { id: 2, contexto: 'reboques', num_fatura: 'FT-R', fornecedor: 'FORN', stock_linhas: [{ quantidade_disp: 2, quantidade_ini: 2, preco_unitario: 200, marca: 'M', subtipo: 'S', medida: '385/65', tipo: 'Novo' }] };
  ctx.__setStockDados([faturaV], [faturaR], [], []);

  ctx.escolherVistaStock('unificada');
  assert.equal(dom.obter('sk-faturas').textContent, 2, 'as duas faturas juntas');
  assert.equal(dom.obter('sk-valor').textContent, '€ 800,00', '4x100 (veículos) + 2x200 (reboques) = 800');

  const html = dom.obter('stock-faturas-container').innerHTML;
  assert.match(html, /icon-truck[\s\S]*?Camião/, 'usa o ícone real (ICON_VEICULO), não um emoji');
  assert.match(html, /icon-trailer[\s\S]*?Reboque/, 'usa o ícone real (ICON_REBOQUE), não um emoji');
});

test('renderStockVista — vistas específicas (não unificada) não mostram o selo de tipo nas faturas', () => {
  const dom = criarDomStub();
  const ctx = carregar(dom.document);
  const faturaV = { id: 1, contexto: 'veiculos', num_fatura: 'FT-V', fornecedor: 'FORN', stock_linhas: [{ quantidade_disp: 1, quantidade_ini: 1, preco_unitario: 50, marca: 'M', subtipo: 'S', medida: '295/80', tipo: 'Novo' }] };
  ctx.__setStockDados([faturaV], [], [], []);
  ctx.escolherVistaStock('veiculos');
  const html = dom.obter('stock-faturas-container').innerHTML;
  assert.doesNotMatch(html, /icon-truck|icon-trailer/, 'sem ambiguidade a resolver, o selo seria ruído');
});
