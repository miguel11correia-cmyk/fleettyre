// ── NAVEGAÇÃO ─────────────────────────────────────────────────────

let secaoActiva = 'veiculos'; // 'veiculos' ou 'reboques'

function toggleSecao(secao) {
  secaoActiva = secao;

  // Mostrar/ocultar menus
  document.getElementById('menu-veiculos').classList.toggle('hidden', secao !== 'veiculos');
  document.getElementById('menu-reboques').classList.toggle('hidden', secao !== 'reboques');

  // Destacar botão activo
  document.getElementById('btn-veiculos').classList.toggle('secao-active', secao === 'veiculos');
  document.getElementById('btn-reboques').classList.toggle('secao-active', secao === 'reboques');

  // Navegar para o dashboard da secção
  if (secao === 'veiculos') {
    nav('dashboard', document.querySelector('[data-page="dashboard"]'));
  } else {
    navR('dashboard-r', document.querySelector('[data-page="dashboard-r"]'));
  }
}

function nav(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('active'));
  const page = document.getElementById('page-' + id);
  if (!page) return;
  page.classList.remove('hidden');
  if (el) el.classList.add('active');
  fecharPainel();

  if (id === 'dashboard')       loadDashboard();
  else if (id === 'frota')      initFrotaSelect();
  else if (id === 'alertas')    loadAlertas();
  else if (id === 'fornecedores') loadFornecedores();
  else if (id === 'marcas')     loadMarcas();
  else if (id === 'stock')      { 
    switchStockContexto('veiculos'); 
  }
}

function navR(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('active'));
  const page = document.getElementById('page-' + id);
  if (!page) return;
  page.classList.remove('hidden');
  if (el) el.classList.add('active');

  if (id === 'dashboard-r')      loadDashboardReboques();
  else if (id === 'frota-r')     initFrotaSelectReboques();
  else if (id === 'alertas-r')   loadAlertasReboques();
  else if (id === 'fornecedores-r') loadFornecedoresReboques();
  else if (id === 'marcas-r')    loadMarcasReboques();
  else if (id === 'stock-r')     { 
    // Stock é partilhado — mostra page-stock com contexto reboques
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById('page-stock').classList.remove('hidden');
    switchStockContexto('reboques'); 
  }
}
