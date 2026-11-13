// ── TELEMETRIA (KMs) ──────────────────────────────────────────────
// Liga o sistema de GPS/telemetria da empresa (Cartrack, Frotcom ou
// Geotab) e mantém o "KM actual" dos veículos actualizado
// automaticamente. Só informativo — nunca substitui os KMs manuais dos
// registos de pneus.
//
// Cartrack é o único testado contra uma conta real (ver cartrack.ts).
// Frotcom e Geotab foram escritos a partir da documentação pública dos
// dois, ainda sem validação com credenciais reais — ver avisos em
// frotcom.ts/geotab.ts antes de confiar neles em produção.

const NOME_FORNECEDOR_TELEMETRIA = { cartrack: 'Cartrack', frotcom: 'Frotcom', geotab: 'Geotab' };
let telemetriaFornecedorEscolhido = 'cartrack';

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
      <div style="display:flex;gap:6px;margin-bottom:14px">
        ${Object.keys(NOME_FORNECEDOR_TELEMETRIA).map(f => `<button type="button" class="btn-seg${f === telemetriaFornecedorEscolhido ? ' active' : ''}" data-seg="${f}" onclick="escolherFornecedorTelemetria('${f}')">${NOME_FORNECEDOR_TELEMETRIA[f]}</button>`).join('')}
      </div>
      <div id="telemetria-form-fornecedor"></div>`;
    renderFormularioTelemetria();
    return;
  }

  const nomeFornecedor = NOME_FORNECEDOR_TELEMETRIA[status.fornecedor] || status.fornecedor;
  const ultima = status.ultima_sincronizacao
    ? new Date(status.ultima_sincronizacao).toLocaleString('pt-PT')
    : 'ainda não sincronizado';

  el.innerHTML = `
    <p style="margin-bottom:10px">Ligado via <strong>${nomeFornecedor}</strong> · última sincronização: ${ultima}</p>
    <div style="display:flex;gap:8px">
      <button class="btn btn-p" onclick="sincronizarTelemetriaAgora()">↻ Sincronizar agora</button>
      <button class="btn" onclick="desligarTelemetria()">Desligar</button>
    </div>`;
}

function escolherFornecedorTelemetria(fornecedor) {
  telemetriaFornecedorEscolhido = fornecedor;
  document.querySelectorAll('#telemetria-status .btn-seg[data-seg]').forEach(b => b.classList.toggle('active', b.dataset.seg === fornecedor));
  renderFormularioTelemetria();
}

function renderFormularioTelemetria() {
  const cont = document.getElementById('telemetria-form-fornecedor');
  if (!cont) return;

  if (telemetriaFornecedorEscolhido === 'cartrack') {
    cont.innerHTML = `
      <p style="font-size:11px;color:var(--text2);margin-bottom:10px">Não é o login normal do portal Cartrack: é o utilizador/password gerados na secção "Definições da API" (API Settings) da conta Cartrack.</p>
      <div class="g2">
        <div class="frow"><label>Utilizador da API</label><input type="text" id="tel-username" placeholder="ex: TRAN00108"></div>
        <div class="frow"><label>Password da API</label><input type="password" id="tel-password"></div>
      </div>
      <div class="frow" style="max-width:200px"><label>Região</label><input type="text" id="tel-region" value="pt"></div>
      <button class="btn btn-brand" onclick="ligarTelemetria()">Ligar Cartrack</button>`;
  } else if (telemetriaFornecedorEscolhido === 'frotcom') {
    cont.innerHTML = `
      <p style="font-size:11px;color:var(--text2);margin-bottom:10px">Credenciais de API da Frotcom (pede-as ao suporte Frotcom, se ainda não as tiveres) — não é o login normal do portal.</p>
      <div class="g2">
        <div class="frow"><label>Utilizador</label><input type="text" id="tel-username"></div>
        <div class="frow"><label>Password</label><input type="password" id="tel-password"></div>
      </div>
      <div class="frow" style="max-width:200px"><label>Provider</label><input type="text" id="tel-provider" value="thirdparty"></div>
      <button class="btn btn-brand" onclick="ligarTelemetria()">Ligar Frotcom</button>`;
  } else if (telemetriaFornecedorEscolhido === 'geotab') {
    cont.innerHTML = `
      <p style="font-size:11px;color:var(--text2);margin-bottom:10px">Login normal da conta Geotab (MyGeotab) — base de dados, utilizador e password.</p>
      <div class="g2">
        <div class="frow"><label>Utilizador</label><input type="text" id="tel-username" placeholder="email@empresa.pt"></div>
        <div class="frow"><label>Password</label><input type="password" id="tel-password"></div>
      </div>
      <div class="frow" style="max-width:200px"><label>Base de dados</label><input type="text" id="tel-database"></div>
      <button class="btn btn-brand" onclick="ligarTelemetria()">Ligar Geotab</button>`;
  }
}

async function ligarTelemetria() {
  const fornecedor = telemetriaFornecedorEscolhido;
  const credenciais = {
    username: document.getElementById('tel-username').value.trim(),
    password: document.getElementById('tel-password').value,
  };
  if (fornecedor === 'cartrack') {
    credenciais.region = document.getElementById('tel-region').value.trim() || 'pt';
  } else if (fornecedor === 'frotcom') {
    credenciais.provider = document.getElementById('tel-provider').value.trim() || 'thirdparty';
  } else if (fornecedor === 'geotab') {
    credenciais.database = document.getElementById('tel-database').value.trim();
  }

  if (!credenciais.username || !credenciais.password || (fornecedor === 'geotab' && !credenciais.database)) {
    showFeedback('telemetria-feedback', 'Preenche todos os campos.', true);
    return;
  }

  showFeedback('telemetria-feedback', 'A testar a ligação...', false);
  const resultado = await chamarFuncaoTelemetria('telemetria-ligar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fornecedor, credenciais }),
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
    showFeedback('telemetria-feedback', `Sincronizado: ${resultado.total ?? 0} veículo(s) verificado(s).`, false);
  } else {
    showFeedback('telemetria-feedback', resultado.erro || 'Erro ao sincronizar.', true);
  }
  await carregarStatusTelemetria();
}
