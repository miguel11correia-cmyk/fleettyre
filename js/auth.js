// ── AUTENTICAÇÃO ──────────────────────────────────────────────────

const EMPRESA_STORAGE_KEY = 'ft_empresa_id';
let empresasDisponiveis = [];

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
  await prosseguirAposAutenticacao();
}

async function logout() {
  await sb.auth.signOut();
  currentUser = null;
  currentEmpresaId = null;
  isAdmin = false;
  empresasDisponiveis = [];
  localStorage.removeItem(EMPRESA_STORAGE_KEY);
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-step-empresa').classList.add('hidden');
  document.getElementById('login-step-cred').classList.remove('hidden');
  document.getElementById('l-pass').value = '';
  document.getElementById('l-err').textContent = '';
}

// Depois de autenticar: descobre se é admin e a que empresas tem acesso,
// e mostra sempre o passo de escolha de empresa (confirmação manual).
async function prosseguirAposAutenticacao() {
  const { data: resAdmin } = await sb.from('admins').select('user_id').eq('user_id', currentUser.id).maybeSingle();
  isAdmin = !!resAdmin;

  empresasDisponiveis = await carregarEmpresasDisponiveis();

  if (empresasDisponiveis.length === 0) {
    document.getElementById('l-err').textContent = 'A tua conta não está associada a nenhuma empresa. Contacta o administrador.';
    return;
  }

  const guardada = localStorage.getItem(EMPRESA_STORAGE_KEY);
  const valida   = empresasDisponiveis.some(e => e.id === guardada);
  mostrarSeletorEmpresa(empresasDisponiveis, valida ? guardada : empresasDisponiveis[0].id);
}

// Empresas a que o utilizador tem acesso: todas se for admin, ou só a própria.
async function carregarEmpresasDisponiveis() {
  if (isAdmin) {
    const { data } = await sb.from('empresas').select('id, nome').order('nome');
    return data || [];
  }
  const { data } = await sb.from('membros').select('empresa_id, empresas(nome)').eq('user_id', currentUser.id).maybeSingle();
  if (!data) return [];
  return [{ id: data.empresa_id, nome: data.empresas?.nome || '—' }];
}

function mostrarSeletorEmpresa(lista, seleccionada) {
  const sel = document.getElementById('l-empresa');
  sel.innerHTML = lista.map(e => `<option value="${e.id}"${e.id === seleccionada ? ' selected' : ''}>${e.nome}</option>`).join('');
  document.getElementById('l-err').textContent = '';
  document.getElementById('login-step-cred').classList.add('hidden');
  document.getElementById('login-step-empresa').classList.remove('hidden');
}

function confirmarEmpresaLogin() {
  currentEmpresaId = document.getElementById('l-empresa').value;
  localStorage.setItem(EMPRESA_STORAGE_KEY, currentEmpresaId);
  mostrarApp();
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
    await prosseguirAposAutenticacao();
  }
});
