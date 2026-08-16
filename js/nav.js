// ── NAVEGAÇÃO ─────────────────────────────────────────────────────

let secaoActiva = 'veiculos';

// Sidebar em mobile (≤768px) passa a um painel deslizante em vez de
// coluna permanente — ver .sidebar.mobile-open em style.css.
function toggleMobileSidebar(force) {
  const sidebar = document.querySelector('.sidebar');
  const scrim = document.querySelector('.sidebar-scrim');
  if (!sidebar) return;
  const open = typeof force === 'boolean' ? force : !sidebar.classList.contains('mobile-open');
  sidebar.classList.toggle('mobile-open', open);
  if (scrim) scrim.classList.toggle('visible', open);
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') toggleMobileSidebar(false);
});

function toggleSecao(secao) {
  secaoActiva = secao;
  document.getElementById('menu-registos').classList.toggle('hidden', secao !== 'registos');
  document.getElementById('menu-veiculos').classList.toggle('hidden', secao !== 'veiculos');
  document.getElementById('menu-reboques').classList.toggle('hidden', secao !== 'reboques');
  document.getElementById('btn-registos').classList.toggle('secao-active', secao === 'registos');
  document.getElementById('btn-veiculos').classList.toggle('secao-active', secao === 'veiculos');
  document.getElementById('btn-reboques').classList.toggle('secao-active', secao === 'reboques');
  if (secao === 'registos') {
    navReg('fornecedores-registo', document.querySelector('[data-page="fornecedores-registo"]'));
  } else if (secao === 'veiculos') {
    nav('dashboard', document.querySelector('[data-page="dashboard"]'));
  } else {
    navR('dashboard-r', document.querySelector('[data-page="dashboard-r"]'));
  }
}

// Secção "Registos" — partilhada entre veículos e reboques (fornecedores,
// marcas, e as fichas de frota), para não ficar escondida dentro de um
// dos dois modos.
function navReg(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('active'));
  toggleMobileSidebar(false);
  const page = document.getElementById('page-' + id);
  if (!page) return;
  page.classList.remove('hidden');
  if (el) el.classList.add('active');

  if      (id === 'fornecedores-registo') renderGestaoFornecedores();
  else if (id === 'marcas-registo')       renderGestaoMarcas();
  else if (id === 'frota-cadastro')       initFrotaCadastro();
  else if (id === 'frota-cadastro-r')     initFrotaCadastroReboques();
}

function nav(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('active'));
  toggleMobileSidebar(false);
  const page = document.getElementById('page-' + id);
  if (!page) return;
  page.classList.remove('hidden');
  if (el) el.classList.add('active');
  fecharPainel();

  if      (id === 'dashboard')     loadDashboard();
  else if (id === 'registar')      { /* formulário, sem load */ }
  else if (id === 'frota')         initFrotaSelect();
  else if (id === 'alertas')       loadAlertas();
  else if (id === 'fornecedores')  loadFornecedores();
  else if (id === 'marcas')        loadMarcas();
  else if (id === 'analytics')     loadAnalytics();
  else if (id === 'stock')         { stockContexto = 'veiculos'; loadStock(); }
}

function navR(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('active'));
  toggleMobileSidebar(false);

  // Stock é partilhado — usa page-stock com contexto reboques
  const pageId = id === 'stock-r' ? 'stock' : id;
  const page = document.getElementById('page-' + pageId);
  if (!page) return;
  page.classList.remove('hidden');
  if (el) el.classList.add('active');

  if      (id === 'dashboard-r')    loadDashboardReboques();
  else if (id === 'registar-r')     { /* formulário, sem load */ }
  else if (id === 'frota-r')        initFrotaSelectReboques();
  else if (id === 'alertas-r')      loadAlertasReboques();
  else if (id === 'fornecedores-r') loadFornecedoresReboques();
  else if (id === 'marcas-r')       loadMarcasReboques();
  else if (id === 'analytics-r')    loadAnalyticsReboques();
  else if (id === 'stock-r')        { stockContexto = 'reboques'; loadStock(); }
}
