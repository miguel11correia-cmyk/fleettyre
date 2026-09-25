// ── FATURAS POR EMAIL ────────────────────────────────────────────
// Liga a caixa de email da empresa (Outlook) e mostra os emails que
// parecem facturas de fornecedores de pneus, com o PDF já apanhado —
// o valor continua a ser introduzido manualmente no registo, aqui só
// se evita andar à procura do email no meio de centenas de outros.

const FUNCOES_URL = SUPABASE_URL + '/functions/v1';

async function chamarFuncaoEmail(nomeComQuery, opcoes = {}) {
  const { data: sessao } = await sb.auth.getSession();
  const token = sessao?.session?.access_token;
  const resp = await fetch(`${FUNCOES_URL}/${nomeComQuery}`, {
    ...opcoes,
    headers: { ...(opcoes.headers || {}), Authorization: `Bearer ${token}` },
  });
  return resp.json();
}

async function initEmailsFornecedores() {
  await carregarStatusEmail();
  await carregarEmailsPendentes();
}

async function carregarStatusEmail() {
  const el = document.getElementById('email-forn-status');
  el.innerHTML = '<p class="empty-msg">A carregar...</p>';

  const status = await chamarFuncaoEmail('email-status?fornecedor=outlook');

  if (!status.ligado) {
    el.innerHTML = `<button class="btn btn-brand" onclick="ligarOutlook()">Ligar Outlook</button>`;
    return;
  }

  const ultima = status.ultima_sincronizacao
    ? new Date(status.ultima_sincronizacao).toLocaleString('pt-PT')
    : 'ainda não sincronizado';

  el.innerHTML = `
    <p style="margin-bottom:10px">Ligado a <strong>${status.conta_email || '—'}</strong> · última sincronização: ${ultima}</p>
    <div style="display:flex;gap:8px">
      <button class="btn btn-p" onclick="sincronizarEmailAgora()">↻ Sincronizar agora</button>
      <button class="btn" onclick="desligarOutlook()">Desligar</button>
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

async function desligarOutlook() {
  if (!confirm('Desligar a conta de email? A sincronização automática pára (os emails já apanhados continuam na lista).')) return;
  await chamarFuncaoEmail('email-oauth-desligar?fornecedor=outlook', { method: 'POST' });
  await carregarStatusEmail();
}

async function sincronizarEmailAgora() {
  showFeedback('email-forn-feedback', 'A sincronizar...', false);
  const resultado = await chamarFuncaoEmail('email-sync-manual?fornecedor=outlook', { method: 'POST' });

  if (resultado.ok) {
    showFeedback('email-forn-feedback', `Sincronizado — ${resultado.novos ?? 0} novo(s) email(s).`, false);
  } else {
    showFeedback('email-forn-feedback', resultado.erro || 'Erro ao sincronizar.', true);
  }
  await carregarStatusEmail();
  await carregarEmailsPendentes();
}

async function carregarEmailsPendentes() {
  const tbody = document.getElementById('email-forn-tbody');

  const { data, error } = await sb
    .from('emails_fornecedores_pendentes')
    .select('*')
    .eq('estado', 'pendente')
    .order('data_recebido', { ascending: false });

  if (error || !data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-msg" style="text-align:center;padding:12px">Sem emails por processar.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(e => `
    <tr>
      <td>${e.data_recebido ? new Date(e.data_recebido).toLocaleDateString('pt-PT') : '—'}</td>
      <td>${e.remetente || '—'}</td>
      <td>${e.assunto || '—'}</td>
      <td>${e.pdf_path ? `<button class="btn btn-sm" onclick="abrirPdfEmailFornecedor(${e.id})">Ver PDF</button>` : '—'}</td>
      <td><button class="btn btn-sm" onclick="arquivarEmailFornecedor(${e.id})">Arquivar</button></td>
    </tr>`).join('');
}

async function abrirPdfEmailFornecedor(id) {
  const { data, error } = await sb.from('emails_fornecedores_pendentes').select('pdf_path').eq('id', id).single();
  if (error || !data?.pdf_path) return;

  const { data: urlData } = await sb.storage.from('faturas-pdf').createSignedUrl(data.pdf_path, 60);
  if (urlData?.signedUrl) window.open(urlData.signedUrl, '_blank');
}

async function arquivarEmailFornecedor(id) {
  await sb.from('emails_fornecedores_pendentes').update({ estado: 'arquivado' }).eq('id', id);
  await carregarEmailsPendentes();
}
