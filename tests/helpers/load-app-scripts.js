// Carrega ficheiros reais de js/ (código de produção, sem alterações)
// dentro de um contexto Node isolado (`vm`), para testar a lógica pura
// de cálculo tal como ela realmente é — sem precisar de build step,
// módulos, nem duplicar a lógica nos testes.
//
// Só funciona para ficheiros sem chamadas DOM/document a nível de topo
// (fora de funções) — confirmado para utils.js, alertas.js, frota.js,
// analytics.js e os equivalentes de reboques; nav.js/auth.js/etc. têm
// listeners a nível de topo e não devem ser carregados aqui.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..', '..');

function loadAppScripts(caminhosRelativos, globaisExtra = {}) {
  const sandbox = { ...globaisExtra };
  vm.createContext(sandbox);
  for (const relativo of caminhosRelativos) {
    const completo = path.join(RAIZ, relativo);
    const codigo = fs.readFileSync(completo, 'utf8');
    vm.runInContext(codigo, sandbox, { filename: relativo });
  }
  return sandbox;
}

module.exports = { loadAppScripts };
