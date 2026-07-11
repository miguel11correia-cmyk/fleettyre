// ── NAVEGAÇÃO ─────────────────────────────────────────────────────

function nav(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('active'));
  const page = document.getElementById('page-' + id);
  if (!page) return;
  page.classList.remove('hidden');
  if (el) el.classList.add('active');
  fecharPainel();

  if (id === 'dashboard')    loadDashboard();
  else if (id === 'frota')   initFrotaSelect();
  else if (id === 'alertas') loadAlertas();
  else if (id === 'fornecedores') loadFornecedores();
  else if (id === 'marcas')  loadMarcas();
  else if (id === 'stock')   loadStock();
}
