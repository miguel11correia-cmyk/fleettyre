// ── UTILIZADORES — CONVIDAR (só admins globais) ──────────────────────
// A escolha de empresa existente/nova e a criação da empresa (se for o
// caso) ficam do lado da função convidar-utilizador — aqui só se monta
// o pedido e mostra o resultado.

async function chamarFuncaoUtilizadores(nome, opcoes = {}) {
  const { data: sessao } = await sb.auth.getSession();
  const token = sessao?.session?.access_token;
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/${nome}`, {
      ...opcoes,
      headers: { 'Content-Type': 'application/json', ...(opcoes.headers || {}), Authorization: `Bearer ${token}` },
    });
    return await resp.json();
  } catch (e) {
    return { ok: false, erro: 'Erro de ligação: ' + e.message };
  }
}

async function carregarEmpresasUtilizadores() {
  const sel = document.getElementById('ut-empresa');
  sel.innerHTML = '<option value="">A carregar...</option>';
  const { data } = await sb.from('empresas').select('id, nome').order('nome');
  const opcoesEmpresas = (data || []).map(e => `<option value="${e.id}">${e.nome}</option>`).join('');
  sel.innerHTML = `<option value="">Escolhe a empresa...</option>${opcoesEmpresas}<option value="__nova__">+ Nova empresa...</option>`;
}

async function initUtilizadores() {
  document.getElementById('ut-email').value = '';
  document.getElementById('ut-nova-empresa-nome').value = '';
  document.getElementById('ut-nova-empresa-row').classList.add('hidden');
  document.getElementById('ut-feedback').classList.add('hidden');
  await carregarEmpresasUtilizadores();
}

function onUtEmpresaChange() {
  const ehNova = document.getElementById('ut-empresa').value === '__nova__';
  document.getElementById('ut-nova-empresa-row').classList.toggle('hidden', !ehNova);
}

async function convidarUtilizador() {
  const email           = document.getElementById('ut-email').value.trim();
  const empresaSel      = document.getElementById('ut-empresa').value;
  const novaEmpresaNome = document.getElementById('ut-nova-empresa-nome').value.trim();

  if (!email) { showFeedback('ut-feedback', 'Preenche o email.', true); return; }
  if (!empresaSel) { showFeedback('ut-feedback', 'Escolhe a empresa.', true); return; }
  if (empresaSel === '__nova__' && !novaEmpresaNome) { showFeedback('ut-feedback', 'Indica o nome da nova empresa.', true); return; }

  const corpo = empresaSel === '__nova__'
    ? { email, nova_empresa_nome: novaEmpresaNome }
    : { email, empresa_id: empresaSel };

  loading(true);
  const resp = await chamarFuncaoUtilizadores('convidar-utilizador', {
    method: 'POST',
    body: JSON.stringify(corpo),
  });
  loading(false);

  if (!resp.ok) { showFeedback('ut-feedback', resp.erro || 'Erro ao convidar.', true); return; }

  showFeedback('ut-feedback', `Convite enviado para ${email}.`);
  document.getElementById('ut-email').value = '';
  document.getElementById('ut-nova-empresa-nome').value = '';
  document.getElementById('ut-nova-empresa-row').classList.add('hidden');
  await carregarEmpresasUtilizadores();
}
