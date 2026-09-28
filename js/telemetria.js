// ── TELEMETRIA (KMs) ──────────────────────────────────────────────
// Liga o sistema de GPS/telemetria da empresa (Cartrack, por agora) e
// mantém o "KM actual" dos veículos actualizado automaticamente. Só
// informativo — nunca substitui os KMs manuais dos registos de pneus.

async function chamarFuncaoTelemetria(nomeComQuery, opcoes = {}) {
  const { data: sessao } = await sb.auth.getSession();
  const token = sessao?.session?.access_token;
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/${nomeComQuery}`, {
      ...opcoes,
      headers: { ...(opcoes.headers || {}), Authorization: `Bearer ${token}` },
    });
    return await resp.json();
  } catch (e) {
    return { ok: false, erro: 'Erro de ligação: ' + e.message };
  }
}

async function initTelemetria() {
  await carregarStatusTelemetria();
}

async function carregarStatusTelemetria() {
  const el = document.getElementById('telemetria-status');
  el.innerHTML = '<p class="empty-msg">A carregar...</p>';

  const status = await chamarFuncaoTelemetria('telemetria-status');

  if (status.erro) {
    el.innerHTML = `<p style="color:var(--red)">${status.erro}</p><button class="btn btn-sm" onclick="carregarStatusTelemetria()">Tentar novamente</button>`;
    return;
  }

  if (!status.ligado) {
    el.innerHTML = `
      <p style="font-size:11px;color:var(--text2);margin-bottom:10px">Não é o login normal do portal Cartrack — é o utilizador/password gerados na secção "Definições da API" (API Settings) da conta Cartrack.</p>
      <div class="g2">
        <div class="frow"><label>Utilizador da API</label><input type="text" id="tel-username" placeholder="ex: TRAN00108"></div>
        <div class="frow"><label>Password da API</label><input type="password" id="tel-password"></div>
      </div>
      <div class="frow" style="max-width:200px"><label>Região</label><input type="text" id="tel-region" value="pt"></div>
      <button class="btn btn-brand" onclick="ligarCartrack()">Ligar Cartrack</button>`;
    return;
  }

  const ultima = status.ultima_sincronizacao
    ? new Date(status.ultima_sincronizacao).toLocaleString('pt-PT')
    : 'ainda não sincronizado';

  el.innerHTML = `
    <p style="margin-bottom:10px">Ligado via <strong>Cartrack</strong> · última sincronização: ${ultima}</p>
    <div style="display:flex;gap:8px">
      <button class="btn btn-p" onclick="sincronizarTelemetriaAgora()">↻ Sincronizar agora</button>
      <button class="btn" onclick="desligarTelemetria()">Desligar</button>
    </div>`;
}

async function ligarCartrack() {
  const credenciais = {
    username: document.getElementById('tel-username').value.trim(),
    password: document.getElementById('tel-password').value,
    region: document.getElementById('tel-region').value.trim() || 'pt',
  };
  if (!credenciais.username || !credenciais.password) {
    showFeedback('telemetria-feedback', 'Preenche o utilizador e a password.', true);
    return;
  }

  showFeedback('telemetria-feedback', 'A testar a ligação...', false);
  const resultado = await chamarFuncaoTelemetria('telemetria-ligar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fornecedor: 'cartrack', credenciais }),
  });

  if (resultado.ok) {
    showFeedback('telemetria-feedback', 'Ligado com sucesso.', false);
  } else {
    showFeedback('telemetria-feedback', resultado.erro || 'Erro ao ligar.', true);
  }
  await carregarStatusTelemetria();
}

async function desligarTelemetria() {
  if (!confirm('Desligar a telemetria? O KM actual dos veículos deixa de ser actualizado automaticamente.')) return;
  await chamarFuncaoTelemetria('telemetria-desligar', { method: 'POST' });
  await carregarStatusTelemetria();
}

async function sincronizarTelemetriaAgora() {
  showFeedback('telemetria-feedback', 'A sincronizar...', false);
  const resultado = await chamarFuncaoTelemetria('telemetria-sync-manual', { method: 'POST' });

  if (resultado.ok) {
    showFeedback('telemetria-feedback', `Sincronizado — ${resultado.total ?? 0} veículo(s) verificado(s).`, false);
  } else {
    showFeedback('telemetria-feedback', resultado.erro || 'Erro ao sincronizar.', true);
  }
  await carregarStatusTelemetria();
}
