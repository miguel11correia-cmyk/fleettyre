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
        subject: `Novo contacto FleetTyre: ${nome}`,
        html: `<p><strong>Nome:</strong> ${escapeHtml(nome)}</p>
               <p><strong>Empresa:</strong> ${escapeHtml(empresa) || '—'}</p>
               <p><strong>Email:</strong> ${escapeHtml(email)}</p>
               <p><strong>Mensagem:</strong></p>
               <p>${escapeHtml(mensagem).replace(/\n/g, '<br>')}</p>`,
      });

      await enviarEmailResend({
        to: email,
        subject: 'Recebemos o teu contacto: FleetTyre',
        html: `<div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1a242b">
                 <h2 style="font-size:19px;font-weight:500;margin:0 0 14px">Obrigado pelo teu interesse na FleetTyre</h2>
                 <p style="font-size:14px;line-height:1.6;color:#5b6770;margin:0 0 10px">Olá ${escapeHtml(nome)},</p>
                 <p style="font-size:14px;line-height:1.6;color:#5b6770;margin:0 0 28px">Recebemos a tua mensagem e entraremos em contacto brevemente.</p>
                 <hr style="border:none;border-top:1px solid #e2e3e5;margin:0 0 20px">
                 <table cellpadding="0" cellspacing="0" role="presentation">
                   <tr>
                     <td style="padding-right:16px;border-right:2px solid #E7101A;vertical-align:middle">
                       <img src="https://fleet-tyre.com/assets/logo-horizontal.png" alt="FleetTyre" style="height:40px;display:block">
                     </td>
                     <td style="padding-left:16px;vertical-align:middle">
                       <p style="font-size:14px;font-weight:600;color:#1a242b;margin:0">FleetTyre</p>
                       <p style="font-size:12px;color:#5b6770;margin:3px 0 0">Gestão de pneus para frotas pesadas</p>
                       <p style="font-size:12px;margin:8px 0 0">
                         <a href="https://fleet-tyre.com" style="color:#C40E17;text-decoration:none">fleet-tyre.com</a>
                         &nbsp;·&nbsp;
                         <a href="mailto:miguel.dscorreia@outlook.pt" style="color:#5b6770;text-decoration:none">miguel.dscorreia@outlook.pt</a>
                       </p>
                     </td>
                   </tr>
                 </table>
               </div>`,
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

// Cabeçalhos de segurança aplicados a todas as respostas.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self' https://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; '),
};

// Rate limiting simples em memória para o formulário de contacto — chave
// por IP, janela deslizante. Suficiente para travar abuso/spam básico;
// não sobrevive a reinícios do processo nem é partilhado entre instâncias,
// mas o Railway corre uma única instância deste serviço.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const contactoHits = new Map();

function limiteExcedido(ip) {
  const agora = Date.now();
  const hits = (contactoHits.get(ip) || []).filter(t => agora - t < RATE_LIMIT_WINDOW_MS);
  hits.push(agora);
  contactoHits.set(ip, hits);
  return hits.length > RATE_LIMIT_MAX;
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/contacto') {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    if (limiteExcedido(ip)) {
      res.writeHead(429, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, erro: 'Demasiados pedidos. Tenta mais tarde.' }));
      return;
    }
    handleContacto(req, res);
    return;
  }

  let urlPath = (req.url === '/' ? '/index.html' : req.url).split('?')[0];
  const filePath = path.join(__dirname, path.normalize(urlPath));

  // Impede path traversal (ex: /../../.env) — a resolução final tem de
  // ficar dentro da pasta do projeto.
  if (!filePath.startsWith(__dirname + path.sep) && filePath !== __dirname) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  // Pastas/ficheiros que existem no repositório mas nunca devem ser
  // servidos publicamente (histórico git, migrações SQL, config interna).
  const relPath = path.relative(__dirname, filePath);
  const primeiroSegmento = relPath.split(path.sep)[0];
  if (
    relPath.split(path.sep).some(seg => seg.startsWith('.')) ||
    ['migrations', 'supabase', 'node_modules'].includes(primeiroSegmento)
  ) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext  = path.extname(filePath);
  const mime = MIME[ext] || 'text/plain';

  // Headers para desativar cache no Cloudflare e browsers
  const headers = {
    ...SECURITY_HEADERS,
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
