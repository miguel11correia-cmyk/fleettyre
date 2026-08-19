// ── ANEXAR PDF (registo, fatura ou pneu em oficina) ─────────────────
// Botão partilhado por 3 sítios da app: registos em "Por matrícula",
// faturas de stock, e pneus em armazém a aguardar oficina — todos são
// apenas linhas de "pneus"/"reboques"/"stock_faturas" com uma coluna
// pdf_path, por isso um único mecanismo de upload/visualização serve
// para os três, em vez de o repetir.

let pdfAnexoAlvo = null; // { tabela, id, onDone }

// Gera o botão (anexar, se ainda não há PDF; ver, se já há) — chamado
// a partir dos renderizadores de linha em frota.js, frota_r.js e
// stock.js. extraStyle é opcional, para encaixar em linhas mais
// compactas (ex: a tabela de "aguarda oficina", toda a 22px).
function pdfAnexoBtnHtml(tabela, id, pdfPath, onDoneFn, extraStyle) {
  const style = extraStyle ? ' style="' + extraStyle + '"' : '';
  return pdfPath
    ? '<button class="btn btn-sm btn-icon"' + style + ' onclick="verPdf(\'' + pdfPath + '\')" title="Ver PDF anexado"><svg viewBox="0 0 24 24"><use href="#icon-file"/></svg></button>'
    : '<button class="btn btn-sm btn-icon"' + style + ' onclick="anexarPdf(\'' + tabela + '\',' + id + ',' + onDoneFn + ')" title="Anexar PDF"><svg viewBox="0 0 24 24"><use href="#icon-paperclip"/></svg></button>';
}

function anexarPdf(tabela, id, onDone) {
  pdfAnexoAlvo = { tabela, id, onDone };
  document.getElementById('pdf-anexo-input').click();
}

async function onPdfAnexoSelecionado(event) {
  const file = event.target.files[0];
  event.target.value = ''; // permite voltar a escolher o mesmo ficheiro depois
  if (!file || !pdfAnexoAlvo) return;
  const { tabela, id, onDone } = pdfAnexoAlvo;
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
