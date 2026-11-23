// ── FATURAS POR EMAIL ────────────────────────────────────────────
// Liga a caixa de email da empresa (Outlook) e mostra os emails que
// parecem facturas de fornecedores de pneus, com o PDF já apanhado —
// o valor continua a ser introduzido manualmente no registo, aqui só
// se evita andar à procura do email no meio de centenas de outros.

const FUNCOES_URL = SUPABASE_URL + '/functions/v1';

async function chamarFuncaoEmail(nomeComQuery, opcoes = {}) {
  const { data: sessao } = await sb.auth.getSession();
  const token = sessao?.session?.access_token;
  try {
    const resp = await fetch(`${FUNCOES_URL}/${nomeComQuery}`, {
      ...opcoes,
      headers: { ...(opcoes.headers || {}), Authorization: `Bearer ${token}` },
    });
    return await resp.json();
  } catch (e) {
    return { ok: false, erro: 'Erro de ligação: ' + e.message };
  }
}

// Parte operacional (lista de emails por processar) — tarefa do dia a
// dia, acessível a partir de Início (ver botão "Faturas"), não uma
// configuração, por isso deixou de estar dentro de "Registos". Só abre
// a pedido (nunca tem entrada própria na barra lateral) e o botão
// "Voltar" fecha-a sempre para Início, de onde é sempre aberta.
async function initEmailsFornecedores() {
  await carregarEmailsPendentes();
}

function abrirPainelEmailsFornecedores() {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById('page-emails-fornecedores').classList.remove('hidden');
  initEmailsFornecedores();
}

// Parte de configuração (ligar/gerir a caixa de email) — tarefa
// pontual, por isso vive em Configuração > Integrações, junto da
// Telemetria, não aqui dentro de "Faturas".
async function initEmailIntegracao() {
  await carregarStatusEmail();
}

function fecharPainelEmailsFornecedores() {
  navInicio();
}

const NOME_FORNECEDOR = { outlook: 'Outlook', google: 'Google', imap: 'IMAP' };

// Uma empresa pode ter várias integrações ligadas ao mesmo tempo,
// incluindo mais do que uma do MESMO fornecedor (ex.: duas caixas IMAP
// distintas) — por isso cada fornecedor mostra uma lista (0 a N linhas
// já ligadas) e continua sempre a oferecer "ligar mais uma", nunca um
// estado binário ligado/desligado. Cada linha identifica-se sempre
// pelo `id` da integração (fornecedor deixou de ser único por empresa).
const FORNECEDORES_EMAIL = ['outlook', 'google', 'imap'];

async function carregarStatusEmail() {
  const el = document.getElementById('email-forn-status');
  el.innerHTML = '<p class="empty-msg">A carregar...</p>';

  const resposta = await chamarFuncaoEmail('email-status');

  if (resposta.erro) {
    el.innerHTML = `<p style="color:var(--red)">${resposta.erro}</p><button class="btn btn-sm" onclick="carregarStatusEmail()">Tentar novamente</button>`;
    return;
  }

  const porFornecedor = { outlook: [], google: [], imap: [] };
  (resposta.integracoes || []).forEach(i => { (porFornecedor[i.fornecedor] || (porFornecedor[i.fornecedor] = [])).push(i); });

  el.innerHTML = FORNECEDORES_EMAIL.map(f => blocoFornecedorEmail(f, porFornecedor[f] || [])).join('');
}

// Uma linha por integração já ligada (conta/última sincronização +
// Sincronizar/Desligar, identificada sempre pelo id).
function linhaIntegracaoEmail(integ) {
  const ultima = integ.ultima_sincronizacao
    ? new Date(integ.ultima_sincronizacao).toLocaleString('pt-PT')
    : 'ainda não sincronizado';
  const conta = (integ.conta_email || '').replace(/'/g, "\\'");
  return `<div class="card" style="margin-bottom:10px">
    <p style="margin-bottom:10px">Ligado a <strong>${integ.conta_email || '—'}</strong> · última sincronização: ${ultima}</p>
    <div style="display:flex;gap:8px">
      <button class="btn btn-p" onclick="sincronizarEmailAgora(${integ.id}, this)">↻ Sincronizar agora</button>
      <button class="btn" onclick="desligarEmail(${integ.id}, '${conta}')">Desligar</button>
    </div>
  </div>`;
}

// Bloco de um fornecedor: as linhas já ligadas (0 a N), seguidas sempre
// do botão (Outlook/Google) ou formulário (IMAP, precisa de servidor/
// credenciais, não é só OAuth) para ligar mais uma — nunca escondido
// só porque já há uma ligação desse fornecedor.
function blocoFornecedorEmail(fornecedor, lista) {
  const nome = NOME_FORNECEDOR[fornecedor] || fornecedor;
  const linhas = lista.map(linhaIntegracaoEmail).join('');

  if (fornecedor === 'imap') {
    const rotulo = lista.length > 0 ? 'Ligar outra caixa por IMAP' : 'Ligar por IMAP';
    return `${linhas}<div class="card" style="margin-bottom:10px">
      <p style="font-size:11px;color:var(--text2);margin-bottom:8px">${rotulo} (email de alojamento normal, sem ser Microsoft 365/Google Workspace):</p>
      <div class="g2">
        <div class="frow"><label>Servidor IMAP</label><input type="text" id="imap-host" placeholder="ex: mail.aempresa.pt"></div>
        <div class="frow"><label>Porta</label><input type="number" id="imap-port" value="993"></div>
      </div>
      <div class="g2">
        <div class="frow"><label>Email</label><input type="email" id="imap-usuario" placeholder="geral@aempresa.pt"></div>
        <div class="frow"><label>Password</label><input type="password" id="imap-password"></div>
      </div>
      <button class="btn btn-p" onclick="ligarImap()">Ligar por IMAP</button>
    </div>`;
  }

  const onclickLigar = fornecedor === 'outlook' ? 'ligarOutlook()' : 'ligarGoogle()';
  const textoBotao = lista.length > 0 ? `+ Ligar outra conta ${nome}` : `Ligar ${nome}`;
  return `${linhas}<div class="card" style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:10px">
    <span>${nome}</span>
    <button class="btn btn-brand" onclick="${onclickLigar}">${textoBotao}</button>
  </div>`;
}

async function ligarOutlook() {
  const resposta = await chamarFuncaoEmail('email-oauth-iniciar?fornecedor=outlook');
  if (resposta.url) {
    window.location.href = resposta.url;
  } else {
    showFeedback('email-forn-feedback', resposta.erro || 'Erro ao iniciar ligação.', true);
  }
}

async function ligarGoogle() {
  const resposta = await chamarFuncaoEmail('email-oauth-iniciar?fornecedor=google');
  if (resposta.url) {
    window.location.href = resposta.url;
  } else {
    showFeedback('email-forn-feedback', resposta.erro || 'Erro ao iniciar ligação.', true);
  }
}

async function ligarImap() {
  const dados = {
    host: document.getElementById('imap-host').value.trim(),
    port: document.getElementById('imap-port').value.trim(),
    usuario: document.getElementById('imap-usuario').value.trim(),
    password: document.getElementById('imap-password').value,
  };
  if (!dados.host || !dados.usuario || !dados.password) {
    showFeedback('email-forn-feedback', 'Preenche o servidor, o email e a password.', true);
    return;
  }

  showFeedback('email-forn-feedback', 'A testar a ligação...', false);
  const resultado = await chamarFuncaoEmail('email-imap-ligar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });

  if (resultado.ok) {
    showFeedback('email-forn-feedback', 'Ligado com sucesso.', false);
  } else {
    showFeedback('email-forn-feedback', resultado.erro || 'Erro ao ligar.', true);
  }
  await carregarStatusEmail();
}

async function desligarEmail(id, contaEmail) {
  const rotulo = contaEmail ? ` (${contaEmail})` : '';
  if (!confirm(`Desligar esta ligação${rotulo}? A sincronização automática desta caixa pára (os emails já apanhados continuam na lista).`)) return;
  await chamarFuncaoEmail('email-oauth-desligar?id=' + encodeURIComponent(id), { method: 'POST' });
  await carregarStatusEmail();
}

async function sincronizarEmailAgora(id, btn) {
  const textoOriginal = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-sm"></span>A sincronizar...';
  }
  showFeedback('email-forn-feedback', '', false);
  const resultado = await chamarFuncaoEmail('email-sync-manual?id=' + encodeURIComponent(id), { method: 'POST' });
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = textoOriginal;
  }

  if (resultado.ok) {
    const exame = resultado.totalNaJanela != null
      ? ` (examinados ${resultado.examinadas ?? 0} de ${resultado.totalNaJanela} nesta caixa)`
      : '';
    const aviso = resultado.completo === false
      ? '; ainda há mensagens por analisar; carrega em "Sincronizar agora" outra vez para continuar (nada fica por trás, só demora mais do que uma vez).'
      : '';
    showFeedback('email-forn-feedback', `Sincronizado: ${resultado.novos ?? 0} novo(s) email(s)${exame}${aviso}`, false);
  } else {
    showFeedback('email-forn-feedback', resultado.erro || 'Erro ao sincronizar.', true);
  }
  await carregarStatusEmail();
  await carregarEmailsPendentes();
}

// Remetente/assunto vêm de emails de fora, não são dados de confiança
// (ao contrário do resto da app, onde quem escreve é sempre um
// utilizador autenticado) — por isso nunca vão directos para innerHTML.
function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

async function carregarEmailsPendentes() {
  const tbody = document.getElementById('email-forn-tbody');

  const { data, error } = await sb
    .from('emails_fornecedores_pendentes')
    .select('*')
    .eq('estado', 'pendente')
    .eq('empresa_id', currentEmpresaId)
    .order('data_recebido', { ascending: false });

  if (error || !data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-msg" style="text-align:center;padding:12px">Sem emails por processar.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(e => `
    <tr>
      <td>${e.data_recebido ? new Date(e.data_recebido).toLocaleDateString('pt-PT') : '—'}</td>
      <td>${escaparHtml(e.remetente) || '—'}</td>
      <td>${escaparHtml(e.assunto) || '—'}</td>
      <td><button class="btn btn-sm" onclick="verMensagemEmailFornecedor(${e.id})">Ver mensagem</button></td>
      <td>${e.pdf_path ? `<button class="btn btn-sm" onclick="abrirPdfEmailFornecedor(${e.id})">Ver PDF</button>` : '—'}</td>
      <td><button class="btn btn-sm" onclick="arquivarEmailFornecedor(${e.id})">Arquivar</button></td>
    </tr>`).join('');
}

async function verMensagemEmailFornecedor(id) {
  const { data, error } = await sb
    .from('emails_fornecedores_pendentes')
    .select('remetente, assunto, resumo_corpo')
    .eq('id', id)
    .eq('empresa_id', currentEmpresaId)
    .single();
  if (error || !data) return;

  const meta = document.getElementById('msg-email-meta');
  meta.innerHTML = '<strong>De:</strong> <span></span><br><strong>Assunto:</strong> <span></span>';
  const spans = meta.querySelectorAll('span');
  spans[0].textContent = data.remetente || '—';
  spans[1].textContent = data.assunto || '—';
  document.getElementById('msg-email-corpo').textContent = data.resumo_corpo || '(sem excerto do corpo disponível)';
  document.getElementById('painel-msg-email').classList.add('open');
}

function fecharPainelMsgEmail() {
  document.getElementById('painel-msg-email').classList.remove('open');
}

async function abrirPdfEmailFornecedor(id) {
  const { data, error } = await sb.from('emails_fornecedores_pendentes').select('pdf_path').eq('id', id).eq('empresa_id', currentEmpresaId).single();
  if (error || !data?.pdf_path) return;

  const { data: urlData } = await sb.storage.from('faturas-pdf').createSignedUrl(data.pdf_path, 60);
  if (urlData?.signedUrl) window.open(urlData.signedUrl, '_blank');
}

async function arquivarEmailFornecedor(id) {
  await sb.from('emails_fornecedores_pendentes').update({ estado: 'arquivado' }).eq('id', id);
  await carregarEmailsPendentes();
}
