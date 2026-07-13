const CACHE = 'fleettyre-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/logo_login.png',
  '/js/config.js',
  '/js/utils.js',
  '/js/dashboard.js',
  '/js/registar.js',
  '/js/frota.js',
  '/js/alertas.js',
  '/js/fornecedores.js',
  '/js/marcas.js',
  '/js/stock.js',
  '/js/nav.js',
  '/js/auth.js',
  '/js/reboques/dashboard_r.js',
  '/js/reboques/registar_r.js',
  '/js/reboques/frota_r.js',
  '/js/reboques/alertas_r.js',
  '/js/reboques/fornecedores_marcas_r.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Pedidos ao Supabase — sempre network
  if (e.request.url.includes('supabase.co')) {
    e.respondWith(fetch(e.request));
    return;
  }
  // Assets — cache first, depois network
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
