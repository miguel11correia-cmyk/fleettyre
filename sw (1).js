const CACHE = 'fleettyre-v2';
const ASSETS = [
  '/fleettyre/',
  '/fleettyre/index.html',
  '/fleettyre/style.css',
  '/fleettyre/app.js',
  '/fleettyre/manifest.json',
  '/fleettyre/icon-192.png',
  '/fleettyre/icon-512.png'
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
  // Para pedidos ao Supabase — sempre network (nunca cache)
  if (e.request.url.includes('supabase.co')) {
    e.respondWith(fetch(e.request));
    return;
  }
  // Para assets da app — cache first, depois network
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
