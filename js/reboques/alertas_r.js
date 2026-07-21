// ── REBOQUES/ALERTAS.JS ──────────────────────────────────────────

async function loadAlertasReboques() {
  loading(true);
  const { data, error } = await sb.from('reboques').select('*');
  loading(false);
  if (error || !data) return;

  const hoje    = mesAtual();
  const activos = data.filter(r => !r.mes_desmont && r.mes_mont);

  // Calcular meses activos e classificar
  const comMeses = activos.map(r => {
    const meses = mesesEntre(r.mes_mont, hoje);
    const lim   = LIMITES_EIXO[r.eixo] || LIMITES_EIXO[null];
    return { ...r, mesesActivo: meses, lim };
  }).sort((a, b) => b.mesesActivo - a.mesesActivo);

  const criticos = comMeses.filter(r => r.mesesActivo >= r.lim.critico);
  const avisos   = comMeses.filter(r => r.mesesActivo >= r.lim.aviso && r.mesesActivo < r.lim.critico);
  const normais  = comMeses.filter(r => r.mesesActivo < r.lim.aviso);

  // Actualizar badge
  const badge = document.getElementById('badge-alertas-r');
  if (badge) {
    badge.textContent = criticos.length;
    badge.classList.toggle('hidden', criticos.length === 0);
  }

  // ── Críticos ──
  const listCrit = document.getElementById('r-alertas-criticos');
  if (listCrit) {
    if (criticos.length === 0) {
      listCrit.innerHTML = '<p class="empty-msg">Nenhum pneu activo acima do limite crítico.</p>';
    } else {
      listCrit.innerHTML = criticos.map(r => {
        const pct = Math.min(100, Math.round((r.mesesActivo / r.lim.critico) * 100));
        return `<div class="alerta-row">
          <div class="alerta-info">
            <span class="alerta-mat">${r.matricula} — ${r.posicao || '—'} (Eixo ${r.eixo || '?'})</span>
            <span class="alerta-det">${r.marca || '—'} ${r.medida || ''} · ${r.tipo || '—'} · Mont.: ${r.mes_mont} · Limite: ${r.lim.critico} meses</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="prog"><div class="prog-fill" style="width:${pct}%;background:#c93030"></div></div>
            <span class="badge b-alert">${r.mesesActivo} meses</span>
          </div>
        </div>`;
      }).join('');
    }
  }

  // ── Avisos ──
  const listAvis = document.getElementById('r-alertas-avisos');
  if (listAvis) {
    if (avisos.length === 0) {
      listAvis.innerHTML = '<p class="empty-msg">Nenhum pneu activo na zona de aviso.</p>';
    } else {
      listAvis.innerHTML = avisos.map(r => {
        const pct = Math.min(100, Math.round((r.mesesActivo / r.lim.critico) * 100));
        return `<div class="alerta-row">
          <div class="alerta-info">
            <span class="alerta-mat">${r.matricula} — ${r.posicao || '—'} (Eixo ${r.eixo || '?'})</span>
            <span class="alerta-det">${r.marca || '—'} ${r.medida || ''} · Mont.: ${r.mes_mont} · Limite aviso: ${r.lim.aviso} meses</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="prog"><div class="prog-fill" style="width:${pct}%;background:#c47b0a"></div></div>
            <span class="badge b-warn">${r.mesesActivo} meses</span>
          </div>
        </div>`;
      }).join('');
    }
  }

  // ── Tabela completa pneus activos ──
  const tbody = document.getElementById('r-alertas-tbody');
  if (tbody) {
    tbody.innerHTML = comMeses.map(r => {
      const cls = r.mesesActivo >= r.lim.critico ? 'badge b-alert' :
                  r.mesesActivo >= r.lim.aviso   ? 'badge b-warn'  : '';
      return `<tr>
        <td>${r.matricula}</td>
        <td>${r.posicao || '—'}</td>
        <td>${r.eixo ? 'Eixo ' + r.eixo : '—'}</td>
        <td>${r.marca || '—'}</td>
        <td>${tipoBadge(r.tipo)}</td>
        <td>${r.mes_mont}</td>
        <td><span class="${cls}">${r.mesesActivo} meses</span></td>
        <td>${r.lim.aviso}m / ${r.lim.critico}m</td>
      </tr>`;
    }).join('');
  }

  // ── Histórico de duração ──
  const comHist = data.filter(r => r.mes_desmont && r.mes_mont);
  const tbodyH  = document.getElementById('r-hist-tbody');
  if (tbodyH) {
    if (comHist.length === 0) {
      tbodyH.innerHTML = '<tr><td colspan="7" class="empty-msg" style="text-align:center;padding:12px">Sem desmontagens registadas ainda.</td></tr>';
    } else {
      tbodyH.innerHTML = comHist.map(r => {
        const meses = mesesEntre(r.mes_mont, r.mes_desmont);
        const lim   = LIMITES_EIXO[r.eixo] || LIMITES_EIXO[null];
        const cls   = meses >= lim.critico ? 'badge b-alert' :
                      meses >= lim.aviso   ? 'badge b-warn'  : 'badge b-ok';
        return `<tr>
          <td>${r.matricula}</td>
          <td>${r.posicao || '—'}</td>
          <td>${r.eixo ? 'Eixo ' + r.eixo : '—'}</td>
          <td>${r.marca || '—'}</td>
          <td>${tipoBadge(r.tipo)}</td>
          <td><span class="${cls}">${meses} meses</span></td>
          <td>${r.escultura_final != null ? r.escultura_final + '\u202fmm' : '—'}</td>
        </tr>`;
      }).join('');
    }
  }
}
