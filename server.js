const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
};

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const CONTACT_TO   = 'miguel.dscorreia@outlook.pt';
const CONTACT_FROM = 'FleetTyre <contacto@fleet-tyre.com>';

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function enviarEmailResend({ to, subject, html, replyTo }) {
  const body = { from: CONTACT_FROM, to: [to], subject, html };
  if (replyTo) body.reply_to = replyTo;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(`Resend ${resp.status}: ${await resp.text()}`);
  }
}

// Formulário de contacto da landing page — notifica o Miguel e confirma ao
// lead, ambos via Resend. Sem framework/dependências, por isso o corpo do
// pedido é lido manualmente do stream.
function handleContacto(req, res) {
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 20000) req.destroy();
  });
  req.on('end', async () => {
    const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };
    let dados;
    try { dados = JSON.parse(body); } catch { dados = {}; }

    const nome     = String(dados.nome || '').trim().slice(0, 200);
    const empresa  = String(dados.empresa || '').trim().slice(0, 200);
    const email    = String(dados.email || '').trim().slice(0, 200);
    const mensagem = String(dados.mensagem || '').trim().slice(0, 5000);
    const honeypot = String(dados.website || '').trim();

    // Campo armadilha para bots — aceita silenciosamente sem enviar nada.
    if (honeypot) {
      res.writeHead(200, jsonHeaders);
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (!nome || !mensagem || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.writeHead(400, jsonHeaders);
      res.end(JSON.stringify({ ok: false, erro: 'Preenche o nome, um email válido e a mensagem.' }));
      return;
    }

    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY não configurada.');
      res.writeHead(500, jsonHeaders);
      res.end(JSON.stringify({ ok: false, erro: 'Envio de email não está configurado. Tenta por email directamente.' }));
      return;
    }

    try {
      await enviarEmailResend({
        to: CONTACT_TO,
        replyTo: email,
        subject: `Novo contacto FleetTyre — ${nome}`,
        html: `<p><strong>Nome:</strong> ${escapeHtml(nome)}</p>
               <p><strong>Empresa:</strong> ${escapeHtml(empresa) || '—'}</p>
               <p><strong>Email:</strong> ${escapeHtml(email)}</p>
               <p><strong>Mensagem:</strong></p>
               <p>${escapeHtml(mensagem).replace(/\n/g, '<br>')}</p>`,
      });

      await enviarEmailResend({
        to: email,
        subject: 'Recebemos o teu contacto — FleetTyre',
        html: `<h2>Obrigado pelo teu interesse na FleetTyre</h2>
               <p>Olá ${escapeHtml(nome)},</p>
               <p>Recebemos a tua mensagem e entraremos em contacto brevemente.</p>
               <p>Equipa FleetTyre</p>`,
      });

      res.writeHead(200, jsonHeaders);
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      console.error('Erro ao enviar email de contacto:', e);
      res.writeHead(500, jsonHeaders);
      res.end(JSON.stringify({ ok: false, erro: 'Erro ao enviar. Tenta novamente ou escreve directamente por email.' }));
    }
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/contacto') {
    handleContacto(req, res);
    return;
  }

  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath.split('?')[0]);

  const ext  = path.extname(filePath);
  const mime = MIME[ext] || 'text/plain';

  // Headers para desativar cache no Cloudflare e browsers
  const headers = {
    'Content-Type': mime,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(__dirname, 'index.html'), (err2, data2) => {
        if (err2) { res.writeHead(404); res.end('Not found'); return; }
        const html = injectEnv(data2.toString());
        res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      });
      return;
    }

    if (filePath.endsWith('app.html')) {
      const html = injectEnv(data.toString());
      res.writeHead(200, headers);
      res.end(html);
      return;
    }

    res.writeHead(200, headers);
    res.end(data);
  });
});

function injectEnv(html) {
  const envScript = `<script>
    window.__SUPABASE_URL__ = "${process.env.SUPABASE_URL || ''}";
    window.__SUPABASE_KEY__ = "${process.env.SUPABASE_KEY || ''}";
  </script>`;
  return html.replace('</head>', envScript + '\n</head>');
}

server.listen(PORT, () => {
  console.log(`FleetTyre a correr na porta ${PORT}`);
});
