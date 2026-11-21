// Cobertura dos restantes helpers puros de js/utils.js — ver
// tests/formatacao.test.js para fmt/mesesEntre/categoriaPosicao.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAppScripts } = require('./helpers/load-app-scripts');
const { criarDomStub } = require('./helpers/dom-stub');

test('fmtEur — formata em euros com 2 casas decimais, espaço fino antes do valor', () => {
  const ctx = loadAppScripts(['js/utils.js']);
  // Só valores sem separador de milhares, para o teste não depender dos
  // dados de locale do motor a correr (ver nota em "Testes", README —
  // fmtEur ainda usa toLocaleString, ao contrário de fmt(); o próprio
  // valor deste teste já mostra a inconsistência: 1234,50 sai sem
  // nenhum separador de milhares neste Node, mesmo passando de 1000).
  assert.equal(ctx.fmtEur(45), '€ 45,00');
  assert.equal(ctx.fmtEur(9.5), '€ 9,50');
  assert.equal(ctx.fmtEur(0), '€ 0,00', '0 é um valor válido (diferente de null/vazio)');
  assert.equal(ctx.fmtEur(null), '—');
  assert.equal(ctx.fmtEur(''), '—');
});

test('tipoBadge — devolve um badge com a classe certa por tipo', () => {
  const ctx = loadAppScripts(['js/utils.js']);
  assert.match(ctx.tipoBadge('Novo'), /b-novo/);
  assert.match(ctx.tipoBadge('Remix'), /b-remix/);
  assert.match(ctx.tipoBadge('Piso Aberto'), /b-piso/);
  assert.match(ctx.tipoBadge('Rechapado'), /b-rechapado/);
  assert.equal(ctx.tipoBadge(null), '');
});

test('countBy — conta ocorrências por chave, agrupando ausências em "(sem registo)"', () => {
  // Nota: o objecto devolvido vem de outro contexto `vm` (outro realm) —
  // assert.deepEqual, em modo strict, compara também o protótipo, por
  // isso falha a comparar directamente mesmo com o mesmo conteúdo.
  // Comparar via JSON.stringify evita esse falso negativo.
  const ctx = loadAppScripts(['js/utils.js']);
  const r = ctx.countBy([{ marca: 'A' }, { marca: 'A' }, { marca: 'B' }, {}], 'marca');
  assert.equal(JSON.stringify(r), JSON.stringify({ A: 2, B: 1, '(sem registo)': 1 }));
});

test('escIni — rasto inicial assumido por tipo de pneu', () => {
  const ctx = loadAppScripts(['js/utils.js']);
  assert.equal(ctx.escIni('Novo'), 16);
  assert.equal(ctx.escIni('Remix'), 14);
  assert.equal(ctx.escIni('Rechapado'), 14);
  assert.equal(ctx.escIni('Piso Aberto'), 10);
  assert.equal(ctx.escIni(undefined), 16, 'sem tipo definido, assume Novo');
});

test('taxaDesgaste — (rasto inicial - final) / KMs efectuados x 1000', () => {
  const ctx = loadAppScripts(['js/utils.js']);
  // Novo (16mm) -> 3mm final, 100 000 km -> (16-3)/100000*1000 = 0.13
  assert.ok(Math.abs(ctx.taxaDesgaste({ tipo: 'Novo', kms_mont: 0, kms_desmont: 100000, rasto_final: 3 }) - 0.13) < 1e-9);
  assert.equal(ctx.taxaDesgaste({ tipo: 'Novo', kms_mont: 0, kms_desmont: 0, rasto_final: 3 }), null, 'sem KMs efectuados, não calcula');
  assert.equal(ctx.taxaDesgaste({ tipo: 'Novo', kms_mont: 0, kms_desmont: 100000, rasto_final: null }), null, 'sem rasto final, não calcula');
  assert.equal(ctx.taxaDesgaste({ tipo: 'Novo', kms_mont: 0, kms_desmont: 100000, rasto_final: 25 }), null, 'rasto fora do intervalo 0-20mm, não calcula');
  assert.equal(ctx.taxaDesgaste({ tipo: 'Novo', kms_mont: 0, kms_desmont: 100000, rasto_final: 20 }), null, 'desgaste negativo (rasto final > inicial), não calcula');
});

test('taxaDesgaste — rejeita taxas fisicamente implausíveis (erro de registo ou rebentamento, não desgaste gradual)', () => {
  const ctx = loadAppScripts(['js/utils.js']);
  // Novo (16mm) -> 3mm final (13mm de desgaste) em só 9000km -> 1.444
  // mm/1000km, bem acima do limite de 0.5 -- quase de certeza um erro
  // de KMs ou um rebentamento, não desgaste normal.
  assert.equal(ctx.taxaDesgaste({ tipo: 'Novo', kms_mont: 0, kms_desmont: 9000, rasto_final: 3 }), null);
  // Mesmo desgaste (13mm), mas em 30000km -> 0.433, dentro do limite -> calcula normalmente.
  assert.ok(Math.abs(ctx.taxaDesgaste({ tipo: 'Novo', kms_mont: 0, kms_desmont: 30000, rasto_final: 3 }) - 0.4333) < 1e-3);
});

test('kmsEfectuados — real quando já desmontado, estimado via km_atual quando ainda montado', () => {
  const ctx = loadAppScripts(['js/utils.js']);
  const real = ctx.kmsEfectuados({ kms_mont: 1000, kms_desmont: 5000 }, null);
  assert.equal(real.km, 4000);
  assert.equal(real.estimado, false);

  const estimado = ctx.kmsEfectuados({ kms_mont: 1000, mes_desmont: null }, 7000);
  assert.equal(estimado.km, 6000);
  assert.equal(estimado.estimado, true);

  assert.equal(ctx.kmsEfectuados({ kms_mont: 1000, mes_desmont: null }, null), null, 'sem desmontagem nem km actual, não há como saber');
});

test('categoriasDeConfig / lugaresDaCategoria — agrupam os lugares fixos por família', () => {
  // SLOTS_VEICULO é um `const` de topo em utils.js — não fica exposto
  // como propriedade do sandbox (nem em JS normal um <script> exporia
  // um `const` de topo em `window`), por isso usa-se aqui a mesma lista
  // literal de '6x2 Pusher' em vez de tentar chegar lá de fora.
  const ctx = loadAppScripts(['js/utils.js']);
  const slots = [
    'Direção Esq', 'Direção Drt',
    'Pusher Esq Int', 'Pusher Esq Ext',
    'Pusher Drt Int', 'Pusher Drt Ext',
    'Tração Esq Int', 'Tração Esq Ext',
    'Tração Drt Int', 'Tração Drt Ext',
  ];
  assert.equal(JSON.stringify(ctx.categoriasDeConfig(slots)), JSON.stringify(['Direção', 'Pusher', 'Tração']));
  assert.equal(JSON.stringify(ctx.lugaresDaCategoria(slots, 'Pusher')), JSON.stringify(['Pusher Esq Int', 'Pusher Esq Ext', 'Pusher Drt Int', 'Pusher Drt Ext']));
  assert.equal(JSON.stringify(ctx.categoriasDeConfig(null)), '[]');
});

test('eixoDoLugar — extrai o número do eixo de um lugar de reboque', () => {
  const ctx = loadAppScripts(['js/utils.js']);
  assert.equal(ctx.eixoDoLugar('Eixo 2 Esq'), 2);
  assert.equal(ctx.eixoDoLugar('Eixo 10 Drt Int'), 10);
  assert.equal(ctx.eixoDoLugar('Direção Esq'), null);
  assert.equal(ctx.eixoDoLugar(null), null);
});

test('maskMesInput — só dígitos, traço inserido a partir do 5º', () => {
  const ctx = loadAppScripts(['js/utils.js']);
  const el = { value: '202611' };
  ctx.maskMesInput(el);
  assert.equal(el.value, '2026-11');

  const comLixo = { value: '20ab2611xy' };
  ctx.maskMesInput(comLixo);
  assert.equal(comLixo.value, '2026-11');
});

test('kmsInputValue / setKmsInputValue / maskKmsInput — campo de KMs com espaço de milhares', () => {
  const ctx = loadAppScripts(['js/utils.js']);

  const el = { value: '638591' };
  ctx.maskKmsInput(el);
  assert.equal(el.value, '638 591', 'formata ao escrever');
  assert.equal(ctx.kmsInputValue(el), 638591, 'lê o valor numérico sem os espaços');

  const vazio = { value: '' };
  assert.ok(Number.isNaN(ctx.kmsInputValue(vazio)), 'campo vazio não é 0, é "sem valor"');

  const destino = { value: '' };
  ctx.setKmsInputValue(destino, 450000);
  assert.equal(destino.value, '450 000', 'preenchido por código já sai formatado');
  ctx.setKmsInputValue(destino, null);
  assert.equal(destino.value, '', 'null limpa o campo em vez de pôr "null"');
});

test('fmt/fmtEurKm continuam a reagir correctamente a valores vindos de um <input> (string)', () => {
  // Protecção extra: os campos de KMs/custo são strings no DOM — garantir
  // que a cadeia maskKmsInput -> kmsInputValue -> fmt não perde precisão
  // nem lança excepção com strings.
  const ctx = loadAppScripts(['js/utils.js']);
  const el = { value: '1000000' };
  ctx.maskKmsInput(el);
  assert.equal(ctx.fmt(ctx.kmsInputValue(el)), '1 000 000');
});

test('resolverLugaresRegisto — sem configuração de eixos conhecida, devolve a categoria repetida sem tocar na base de dados', async () => {
  const dom = criarDomStub();
  const ctx = loadAppScripts(['js/utils.js'], { document: dom.document });
  // SLOTS_VEICULO[undefined] é undefined -> lugaresCategoria fica [] ->
  // ramo que não chama sb.from nenhum (por isso nem precisa de stub de sb).
  const resultado = await ctx.resolverLugaresRegisto('pneus', 'AA-00-AA', 'Direção', 2, undefined, {});
  assert.equal(resultado.ok, true);
  assert.equal(JSON.stringify(resultado.posicoes), JSON.stringify(['Direção', 'Direção']));
});
