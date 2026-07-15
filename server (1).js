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
  '.ico':  'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath.split('?')[0]);

  const ext  = path.extname(filePath);
  const mime = MIME[ext] || 'text/plain';

  // Headers para desactivar cache no Cloudflare e browsers
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

    if (filePath.endsWith('index.html')) {
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
