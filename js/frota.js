// ── FROTA ──────────────────────────────────────────────

async function initFrotaSelect() {
  loading(true);
  const { data, error } = await sb
    .from('pneus')
    .select('matricula')
    .order('matricula');
  loading(false);

  if (error || !data) return;

  const mats = [...new Set(data.map(r => r.matricula))].sort();
  const sel  = document.getElementById('sel-mat');
  const prev = sel.value;
  sel.innerHTML = mats.map(m => `<option value="${m}"${m === prev ? ' selected' : ''}>${m}</option>`).join('');

  if (mats.length > 0) await loadFrota();
}

async function loadFrota() {
  const mat = document.getElementById('sel-mat').value;
  if (!mat) return;

  loading(true);
  const { data, error } = await sb
    .from('pneus')
    .select('*')
    .eq('matricula', mat)
    .order('mes_mont', { ascending: true });
  loading(false);

  if (error || !data) return;

  // ── KPIs da matrícula ──
  const activos   = data.filter(r => !r.mes_desmont).length;
  const comKms    = data.filter(r => r.kms_desmont && r.kms_mont && r.kms_desmont > r.kms_mont);
  const kmsEfArr  = comKms.map(r => r.kms_desmont - r.kms_mont);
  const kmsmedios = kmsEfArr.length > 0
    ? Math.round(kmsEfArr.reduce((s, v) => s + v, 0) / kmsEfArr.length)
    : null;

  const comCusto   = data.filter(r => r.custo_pneu != null && r.custo_pneu > 0);
  const custoTotal = comCusto.reduce((s, r) => s + Number(r.custo_pneu), 0);
  const custoMed   = comCusto.length > 0 ? custoTotal / comCusto.length : null;

  // €/km = custo médio por pneu ÷ KMs médios por pneu
  const eurKm = (custoMed && kmsmedios && kmsmedios > 0)
    ? (custoMed / kmsmedios).toFixed(4)
    : null;

  document.getElementById('fk1').textContent = data.length;
  document.getElementById('fk2').textContent = activos;
  document.getElementById('fk3').textContent = kmsmedios ? fmt(kmsmedios) : '—';
  document.getElementById('fk4').textContent = custoTotal > 0 ? fmtEur(custoTotal) : '—';
  document.getElementById('fk5').textContent = custoMed   ? fmtEur(custoMed)   : '—';
  document.getElementById('fk6').textContent = eurKm      ? '€\u202f' + eurKm   : '—';

  // ── Tabela ──
  const tbody = document.getElementById('frota-tbody');
  tbody.innerHTML = data.map(r => {
    const kmsEf = (r.kms_desmont && r.kms_mont && r.kms_desmont > r.kms_mont)
      ? fmt(r.kms_desmont - r.kms_mont) : '—';
    const esc   = r.escultura_final != null ? r.escultura_final + '\u202fmm' : '—';
    const escCls= (r.escultura_final != null && r.escultura_final <= 3) ? 'badge b-alert' : '';
    const custoTot = (r.custo_pneu || 0) + (r.custo_mo || 0);
    const acBtn = `<div style="display:flex;gap:4px">
        ${!r.mes_desmont ? `<button class="btn btn-s" onclick="abrirPainel(${r.id})">🔧 Desmontar</button>` : '<span style="color:var(--text3);font-size:11px">✓</span>'}
        <button class="btn btn-sm" onclick="abrirEdicao(${r.id})" style="height:28px;padding:0 8px;font-size:11px">✏️</button>
      </div>`;
    return `<tr>
      <td>${r.mes_mont || '—'}</td>
      <td>${r.posicao  || '—'}</td>
      <td>${r.marca    || '—'}</td>
      <td>${r.medida   || '—'}</td>
      <td>${tipoBadge(r.tipo)}</td>
      <td style="text-align:right">${fmt(r.kms_mont)}</td>
      <td>${r.mes_desmont || '—'}</td>
      <td style="text-align:right">${r.kms_desmont ? fmt(r.kms_desmont) : '—'}</td>
      <td style="text-align:right">${kmsEf}</td>
      <td><span class="${escCls}">${esc}</span></td>
      <td>${r.destino  || '—'}</td>
      <td style="text-align:right">${r.custo_pneu != null ? fmtEur(r.custo_pneu) : '—'}</td>
      <td style="text-align:right">${r.custo_mo   != null ? fmtEur(r.custo_mo)   : '—'}</td>
      <td style="text-align:right">${custoTot > 0 ? fmtEur(custoTot) : '—'}</td>
      <td>${acBtn}</td>
    </tr>`;
  }).join('');
}

async function abrirPainel(id) {
  // Buscar registo para mostrar info
  const { data } = await sb.from('pneus').select('*').eq('id', id).single();
  if (!data) return;
  painelId = id;

  document.getElementById('painel-info').innerHTML =
    `<strong>${data.matricula}</strong> · ${data.posicao || '—'} · ${data.marca || '—'} ${data.medida || ''}<br>
     <span style="color:var(--text2)">Montagem: ${data.mes_mont} · KMs montagem: ${fmt(data.kms_mont)}</span>`;

  // Limpar campos
  ['d-mes','d-kms','d-esc','d-mo'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('d-dest').value = 'Remix';
  document.getElementById('d-feedback').classList.add('hidden');
  document.getElementById('painel').classList.add('open');
}

function fecharPainel() {
  document.getElementById('painel').classList.remove('open');
  painelId = null;
}

async function guardarDesmontagem() {
  if (painelId == null) return;

  const mes    = document.getElementById('d-mes').value.trim();
  const kmsStr = document.getElementById('d-kms').value;
  const escStr = document.getElementById('d-esc').value;
  const dest   = document.getElementById('d-dest').value;
  const moStr  = document.getElementById('d-mo').value;

  // Validações
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    showFeedback('d-feedback', 'Mês inválido. Usa AAAA-MM.', true); return;
  }
  const kms = parseInt(kmsStr);
  if (!kms || kms <= 0) {
    showFeedback('d-feedback', 'KMs são obrigatórios.', true); return;
  }

  // Buscar registo original para validar KMs
  const { data: orig } = await sb.from('pneus').select('kms_mont, tipo, custo_pneu').eq('id', painelId).single();
  if (orig && orig.kms_mont && kms <= orig.kms_mont) {
    showFeedback('d-feedback', `KMs de desmontagem (${fmt(kms)}) têm de ser maiores que os de montagem (${fmt(orig.kms_mont)}).`, true);
    return;
  }

  const esc  = escStr !== '' ? parseFloat(escStr) : null;
  const mo   = moStr  !== '' ? parseFloat(moStr)  : null;

  // Custo total = custo pneu (já existente) + mão obra desmontagem
  const custoTotalUpd = ((orig?.custo_pneu || 0) + (mo || 0)) || null;

  const updates = {
    mes_desmont:     mes,
    kms_desmont:     kms,
    escultura_final: (esc != null && esc >= 0 && esc <= 20) ? esc : null,
    destino:         dest,
    custo_mo:        mo,
    custo_total:     custoTotalUpd,
  };

  loading(true);
  const { error } = await sb.from('pneus').update(updates).eq('id', painelId);
  loading(false);

  if (error) {
    showFeedback('d-feedback', 'Erro: ' + error.message, true); return;
  }
  showFeedback('d-feedback', 'Desmontagem guardada.');
  setTimeout(() => {
    fecharPainel();
    loadFrota();
    loadDashboard();
  }, 800);
}

async function abrirEdicao(id) {
  loading(true);
  const { data, error } = await sb.from('pneus').select('*').eq('id', id).single();
  loading(false);
  if (error || !data) return;

  editId = id;

  // Preencher painel de edição
  document.getElementById('e-mat').value     = data.matricula    || '';
  document.getElementById('e-mes').value     = data.mes_mont     || '';
  document.getElementById('e-kms').value     = data.kms_mont     || '';
  document.getElementById('e-pos').value     = data.posicao      || '';
  document.getElementById('e-marca').value   = data.marca        || '';
  document.getElementById('e-medida').value  = data.medida       || '';
  document.getElementById('e-tipo').value    = data.tipo         || 'Novo';
  document.getElementById('e-forn').value    = data.fornecedor   || '';
  document.getElementById('e-custo').value   = data.custo_pneu   != null ? data.custo_pneu : '';
  document.getElementById('e-mo').value      = data.custo_mo     != null ? data.custo_mo   : '';
  document.getElementById('e-mes-d').value   = data.mes_desmont  || '';
  document.getElementById('e-kms-d').value   = data.kms_desmont  || '';
  document.getElementById('e-esc').value     = data.escultura_final != null ? data.escultura_final : '';
  document.getElementById('e-dest').value    = data.destino      || '';

  document.getElementById('e-feedback').classList.add('hidden');
  document.getElementById('painel-editar').classList.add('open');
}

function fecharEdicao() {
  document.getElementById('painel-editar').classList.remove('open');
  editId = null;
}

async function guardarEdicao() {
  if (editId == null) return;

  const mat    = document.getElementById('e-mat').value.trim().toUpperCase();
  const mes    = document.getElementById('e-mes').value.trim();
  const kms    = parseInt(document.getElementById('e-kms').value) || null;
  const pos    = document.getElementById('e-pos').value.trim().toUpperCase();
  const marca  = document.getElementById('e-marca').value.trim().toUpperCase();
  const medida = document.getElementById('e-medida').value.trim();
  const tipo   = document.getElementById('e-tipo').value;
  const forn   = document.getElementById('e-forn').value.trim().toUpperCase();
  const custoP = document.getElementById('e-custo').value !== '' ? parseFloat(document.getElementById('e-custo').value) : null;
  const custoMO= document.getElementById('e-mo').value    !== '' ? parseFloat(document.getElementById('e-mo').value)    : null;
  const mesD   = document.getElementById('e-mes-d').value.trim() || null;
  const kmsD   = document.getElementById('e-kms-d').value !== '' ? parseInt(document.getElementById('e-kms-d').value) : null;
  const esc    = document.getElementById('e-esc').value   !== '' ? parseFloat(document.getElementById('e-esc').value)  : null;
  const dest   = document.getElementById('e-dest').value || null; // vazio = null

  // Validações básicas
  if (!mat) { showFeedback('e-feedback', 'Matrícula é obrigatória.', true); return; }
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) { showFeedback('e-feedback', 'Mês de montagem inválido. Usa AAAA-MM.', true); return; }
  if (!kms || kms <= 0) { showFeedback('e-feedback', 'KMs de montagem são obrigatórios.', true); return; }
  if (kmsD && kmsD <= kms) { showFeedback('e-feedback', `KMs de desmontagem (${kmsD}) têm de ser maiores que os de montagem (${kms}).`, true); return; }
  if (esc != null && (esc < 0 || esc > 25)) { showFeedback('e-feedback', 'Escultura tem de ser entre 0 e 25mm.', true); return; }

  const updates = {
    matricula:       mat,
    mes_mont:        mes,
    kms_mont:        kms,
    posicao:         pos    || null,
    marca:           marca  || null,
    medida:          medida || null,
    tipo:            tipo   || null,
    fornecedor:      forn   || null,
    custo_pneu:      custoP,
    custo_mo:        custoMO,
    mes_desmont:     mesD,
    kms_desmont:     kmsD,
    escultura_final: esc,
    destino:         dest,
  };

  loading(true);
  const { error } = await sb.from('pneus').update(updates).eq('id', editId);
  loading(false);

  if (error) { showFeedback('e-feedback', 'Erro: ' + error.message, true); return; }

  showFeedback('e-feedback', 'Registo actualizado.');
  setTimeout(() => { fecharEdicao(); loadFrota(); loadDashboard(); }, 800);
}

