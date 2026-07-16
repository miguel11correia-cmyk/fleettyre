// ── AUTENTICAÇÃO ──────────────────────────────────────────────────

async function login() {
  const email = document.getElementById('l-email').value.trim();
  const pass  = document.getElementById('l-pass').value;
  if (!email || !pass) {
    document.getElementById('l-err').textContent = 'Preenche email e password.';
    return;
  }
  loading(true);
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  loading(false);
  if (error) {
    document.getElementById('l-err').textContent = 'Credenciais inválidas.';
    return;
  }
  currentUser = data.user;
  await carregarEmpresaUser();
  mostrarApp();
}

async function logout() {
  await sb.auth.signOut();
  currentUser = null;
  currentEmpresaId = null;
  isAdmin = false;
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('l-pass').value = '';
}

// Carrega a empresa do utilizador (membros) e se tem acesso global (admins)
async function carregarEmpresaUser() {
  const [resMembro, resAdmin] = await Promise.all([
    sb.from('membros').select('empresa_id').eq('user_id', currentUser.id).maybeSingle(),
    sb.from('admins').select('user_id').eq('user_id', currentUser.id).maybeSingle(),
  ]);
  currentEmpresaId = resMembro.data?.empresa_id || null;
  isAdmin = !!resAdmin.data;
}

function mostrarApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('user-email').textContent = currentUser.email;
  carregarListasFornMarca();
  loadDashboard();
}

// Verificar sessão ao carregar
window.addEventListener('load', async () => {
  const { data } = await sb.auth.getSession();
  if (data.session) {
    currentUser = data.session.user;
    await carregarEmpresaUser();
    mostrarApp();
  }
  // Registar service worker
  // navigator.serviceWorker.register('/sw.js')
  //   .catch(e => console.log('SW erro:', e));
});
