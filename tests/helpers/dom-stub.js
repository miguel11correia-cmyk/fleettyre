// DOM mínimo, só com o necessário para as funções de render da app
// correrem fora do browser: document.getElementById devolve sempre o
// mesmo objecto para o mesmo id (criado na primeira vez que é pedido),
// com innerHTML/textContent/value/classList/dataset fingidos. Não é
// jsdom — não faz parsing de HTML nenhum, só guarda a string que lá foi
// posta, para os testes poderem verificar o conteúdo com `includes`/
// regex. Suficiente para testar lógica de agregação/formatação embutida
// em funções que escrevem innerHTML, sem arrastar uma dependência nova.
function criarElemento(id) {
  const el = {
    id,
    innerHTML: '',
    textContent: '',
    value: '',
    className: '',
    style: {},
    dataset: {},
    children: [],
    classList: {
      _set: new Set(),
      add(...cs) { cs.forEach(c => this._set.add(c)); },
      remove(...cs) { cs.forEach(c => this._set.delete(c)); },
      toggle(c, force) {
        const tem = this._set.has(c);
        const ligar = force === undefined ? !tem : force;
        if (ligar) this._set.add(c); else this._set.delete(c);
        return ligar;
      },
      contains(c) { return this._set.has(c); },
    },
    appendChild(child) { this.children.push(child); return child; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener() {},
    closest() { return null; },
    scrollIntoView() {},
  };
  return el;
}

function criarDomStub() {
  const elementos = new Map();
  function obter(id) {
    if (!elementos.has(id)) elementos.set(id, criarElemento(id));
    return elementos.get(id);
  }
  const document = {
    getElementById: obter,
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: () => criarElemento('__tmp'),
    addEventListener: () => {},
  };
  return { document, elementos, obter };
}

module.exports = { criarDomStub };
