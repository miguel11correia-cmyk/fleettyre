// ── AUTENTICAÇÃO ──────────────────────────────────────────────────

const EMPRESA_STORAGE_KEY = 'ft_empresa_id';
let empresasDisponiveis = [];

async function login() {
  const email = document.getElementById('l-email').value.trim();
  const pass  = document.getElementById('l-pass').value;
  if (!email || !pass) {
    document.getElementById('l-err').textContent = 'Preencha o email e a password.';
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
    document.getElementById('l-err').textContent = 'A conta não está associada a nenhuma empresa. Contacte o administrador.';
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
  carregarListaVeiculos();
  carregarListaReboquesFrota();
  carregarListaSubtipos();
  loadDashboard();

  // Voltar de "Ligar Outlook" (email-oauth-callback) — abre logo a
  // página de Faturas por email com o resultado, e limpa o URL.
  const params = new URLSearchParams(location.search);
  if (params.has('email_ligado') || params.has('email_erro')) {
    toggleSecao('registos');
    navReg('emails-fornecedores', document.querySelector('[data-page="emails-fornecedores"]'));
    setTimeout(() => {
      showFeedback('email-forn-feedback', params.has('email_ligado') ? 'Conta ligada com sucesso.' : 'Erro ao ligar a conta. Tenta novamente.', params.has('email_erro'));
    }, 300);
    history.replaceState(null, '', location.pathname);
  }
}

// ── MUDAR PASSWORD ────────────────────────────────────────────────

function abrirPainelPassword() {
  document.getElementById('pw-nova').value = '';
  document.getElementById('pw-confirmar').value = '';
  document.getElementById('pw-feedback').classList.add('hidden');
  document.getElementById('painel-password').classList.add('open');
}

function fecharPainelPassword() {
  document.getElementById('painel-password').classList.remove('open');
}

async function guardarNovaPassword() {
  const nova      = document.getElementById('pw-nova').value;
  const confirmar = document.getElementById('pw-confirmar').value;

  if (!nova || nova.length < 6) {
    showFeedback('pw-feedback', 'A password tem de ter pelo menos 6 caracteres.', true);
    return;
  }
  if (nova !== confirmar) {
    showFeedback('pw-feedback', 'As passwords não coincidem.', true);
    return;
  }

  loading(true);
  const { error } = await sb.auth.updateUser({ password: nova });
  loading(false);

  if (error) {
    showFeedback('pw-feedback', 'Erro: ' + error.message, true);
    return;
  }
  showFeedback('pw-feedback', 'Password alterada com sucesso.');
  document.getElementById('pw-nova').value = '';
  document.getElementById('pw-confirmar').value = '';
  setTimeout(fecharPainelPassword, 1200);
}

// ── ESQUECI-ME DA PASSWORD ───────────────────────────────────────

function mostrarRecuperarPassword() {
  document.getElementById('login-step-cred').classList.add('hidden');
  document.getElementById('login-step-recuperar').classList.remove('hidden');
  document.getElementById('lr-email').value = document.getElementById('l-email').value;
  const err = document.getElementById('l-err');
  err.style.color = '';
  err.textContent = '';
}

function voltarLogin() {
  document.getElementById('login-step-recuperar').classList.add('hidden');
  document.getElementById('login-step-nova-password').classList.add('hidden');
  document.getElementById('login-step-cred').classList.remove('hidden');
  const err = document.getElementById('l-err');
  err.style.color = '';
  err.textContent = '';
}

async function enviarLinkRecuperacao() {
  const email = document.getElementById('lr-email').value.trim();
  const err   = document.getElementById('l-err');
  err.style.color = '';

  if (!email) { err.textContent = 'Preencha o email.'; return; }

  loading(true);
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://fleet-tyre.com/app.html'
  });
  loading(false);

  if (error) { err.textContent = 'Erro: ' + error.message; return; }
  err.style.color = 'var(--green)';
  err.textContent = 'Se esse email existir, foi enviado um link de recuperação.';
}

async function guardarPasswordRecuperada() {
  const nova      = document.getElementById('lnp-nova').value;
  const confirmar = document.getElementById('lnp-confirmar').value;
  const err       = document.getElementById('l-err');
  err.style.color = '';

  if (!nova || nova.length < 6) { err.textContent = 'A password tem de ter pelo menos 6 caracteres.'; return; }
  if (nova !== confirmar) { err.textContent = 'As passwords não coincidem.'; return; }

  loading(true);
  const { error } = await sb.auth.updateUser({ password: nova });
  loading(false);

  if (error) { err.textContent = 'Erro: ' + error.message; return; }

  document.getElementById('login-step-nova-password').classList.add('hidden');
  await prosseguirAposAutenticacao();
}

// Link de recuperação: o Supabase cria uma sessão temporária e dispara este
// evento em vez de um login normal — mostra o formulário de nova password
// em vez de avançar logo para a app.
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    currentUser = session.user;
    document.getElementById('login-step-cred').classList.add('hidden');
    document.getElementById('login-step-empresa').classList.add('hidden');
    document.getElementById('login-step-recuperar').classList.add('hidden');
    document.getElementById('login-step-nova-password').classList.remove('hidden');
    document.getElementById('l-err').textContent = '';
  }
});

// Verificar sessão ao carregar
window.addEventListener('load', async () => {
  // Link de recuperação — deixa o evento PASSWORD_RECOVERY acima tratar disto.
  if (window.location.hash.includes('type=recovery')) return;

  const { data } = await sb.auth.getSession();
  if (data.session) {
    currentUser = data.session.user;
    await prosseguirAposAutenticacao();
  }
});
