// ── ANEXAR PDF (registo, fatura ou pneu em oficina) ─────────────────
// Botão partilhado por 3 sítios da app: registos em "Por matrícula",
// faturas de stock, e pneus em armazém a aguardar oficina — todos são
// apenas linhas de "pneus"/"reboques"/"stock_faturas" com uma coluna
// pdf_path, por isso um único mecanismo de upload/visualização serve
// para os três, em vez de o repetir.
//
// Quando já há um PDF anexado, o mesmo botão abre um pequeno menu
// (Ver / Substituir) em vez de criar um botão extra na linha — reusa
// o visual do menu das listas customizadas (.fsel-list/.fsel-opt).

let pdfAnexoAlvo = null; // { tabela, id, onDone, oldPath }
let pdfMenuAberto = null; // elemento do menu atualmente aberto, se houver

// Gera o botão (anexar, se ainda não há PDF; menu ver/substituir, se
// já há) — chamado a partir dos renderizadores de linha em frota.js,
// frota_r.js e stock.js. extraStyle é opcional, para encaixar em
// linhas mais compactas (ex: a tabela de "aguarda oficina", a 22px).
function pdfAnexoBtnHtml(tabela, id, pdfPath, onDoneFn, extraStyle) {
  const style = extraStyle ? ' style="' + extraStyle + '"' : '';
  return pdfPath
    ? '<button class="btn btn-sm btn-icon"' + style + ' onclick="abrirMenuPdf(event,\'' + tabela + '\',' + id + ',\'' + pdfPath + '\',' + onDoneFn + ')" title="PDF anexado"><svg viewBox="0 0 24 24"><use href="#icon-file"/></svg></button>'
    : '<button class="btn btn-sm btn-icon"' + style + ' onclick="anexarPdf(\'' + tabela + '\',' + id + ',' + onDoneFn + ')" title="Anexar PDF"><svg viewBox="0 0 24 24"><use href="#icon-paperclip"/></svg></button>';
}

function abrirMenuPdf(event, tabela, id, pdfPath, onDone) {
  event.stopPropagation();
  fecharMenuPdf();

  const trigger = event.currentTarget;
  const menu = document.createElement('div');
  menu.className = 'fsel-list';
  menu.setAttribute('role', 'menu');
  menu.innerHTML =
    '<div class="fsel-opt" data-acao="ver">Ver PDF</div>' +
    '<div class="fsel-opt" data-acao="trocar">Substituir PDF</div>';
  document.body.appendChild(menu);

  const r = trigger.getBoundingClientRect();
  const menuW = menu.getBoundingClientRect().width;
  menu.style.left = Math.round(Math.min(r.left, window.innerWidth - menuW - 8)) + 'px';
  menu.style.top = Math.round(r.bottom + 4) + 'px';

  menu.querySelector('[data-acao="ver"]').addEventListener('click', () => {
    fecharMenuPdf();
    verPdf(pdfPath);
  });
  menu.querySelector('[data-acao="trocar"]').addEventListener('click', () => {
    fecharMenuPdf();
    anexarPdf(tabela, id, onDone, pdfPath);
  });

  requestAnimationFrame(() => menu.classList.add('open'));
  pdfMenuAberto = menu;
}

function fecharMenuPdf() {
  if (!pdfMenuAberto) return;
  const m = pdfMenuAberto;
  pdfMenuAberto = null;
  m.classList.remove('open');
  setTimeout(() => m.remove(), 160);
}

document.addEventListener('click', (e) => {
  if (pdfMenuAberto && !pdfMenuAberto.contains(e.target)) fecharMenuPdf();
});
document.addEventListener('scroll', (e) => {
  if (pdfMenuAberto && !pdfMenuAberto.contains(e.target)) fecharMenuPdf();
}, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharMenuPdf(); });

// oldPath (opcional) — quando é uma substituição, para apagar o
// ficheiro antigo do Storage depois de o novo ficar gravado com sucesso.
function anexarPdf(tabela, id, onDone, oldPath) {
  pdfAnexoAlvo = { tabela, id, onDone, oldPath };
  document.getElementById('pdf-anexo-input').click();
}

async function onPdfAnexoSelecionado(event) {
  const file = event.target.files[0];
  event.target.value = ''; // permite voltar a escolher o mesmo ficheiro depois
  if (!file || !pdfAnexoAlvo) return;
  const { tabela, id, onDone, oldPath } = pdfAnexoAlvo;
  pdfAnexoAlvo = null;

  if (file.type !== 'application/pdf') { alert('Só são aceites ficheiros PDF.'); return; }
  if (file.size > 10 * 1024 * 1024) { alert('Ficheiro demasiado grande (máx. 10MB).'); return; }

  loading(true);
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const nomeLimpo = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const caminho = currentEmpresaId + '/' + tabela + '-' + id + '-' + Date.now() + '-' + nomeLimpo;

    const { error: errUp } = await sb.storage.from('faturas-pdf').upload(caminho, bytes, { contentType: 'application/pdf' });
    if (errUp) throw errUp;

    const { error: errDb } = await sb.from(tabela).update({ pdf_path: caminho }).eq('id', id);
    if (errDb) throw errDb;

    // Limpeza do ficheiro antigo — melhor esforço, não bloqueia o
    // fluxo principal se falhar (o novo já está gravado e associado).
    if (oldPath) sb.storage.from('faturas-pdf').remove([oldPath]).catch(() => {});

    loading(false);
    if (typeof onDone === 'function') onDone();
  } catch (e) {
    loading(false);
    alert('Erro ao anexar o PDF: ' + e.message);
  }
}

async function verPdf(pdfPath) {
  if (!pdfPath) return;
  loading(true);
  const { data, error } = await sb.storage.from('faturas-pdf').createSignedUrl(pdfPath, 60);
  loading(false);
  if (error || !data) { alert('Erro ao abrir o PDF: ' + (error ? error.message : '')); return; }
  window.open(data.signedUrl, '_blank');
}
