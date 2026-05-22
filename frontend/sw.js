'use strict';

const CACHE_NAME = 'atlas-v3';
const OFFLINE_URL = '/app';

// Arquivos essenciais para funcionar offline
const PRECACHE = [
  '/app',
  '/login',
  '/css/variables.css',
  '/css/layout.css',
  '/css/components.css',
  '/css/auth.css',
  '/css/chat.css',
  '/css/investments.css',
  '/css/features.css',
  '/js/storage.js',
  '/js/config.js',
  '/js/api.js',
  '/js/login.js',
  '/js/app.js',
  '/js/ai.js',
  '/js/charts.js',
  '/js/investments.js',
  '/js/export.js',
  '/favicon.svg',
  '/icon-512.svg',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
];

self.addEventListener('install', event => {
  // Não chama skipWaiting aqui — deixa o SW novo em "waiting"
  // para que o cliente possa exibir o aviso de atualização.
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Não cacheia requisições de API — sempre vai ao servidor
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => new Response(JSON.stringify({ message: 'Sem conexão. Verifique sua internet.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }))
    );
    return;
  }

  // JS: network-first para sempre servir a versão mais recente
  if (url.pathname.startsWith('/js/')) {
    event.respondWith(
      fetch(request).then(response => {
        if (response && response.status === 200) {
          caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
        }
        return response;
      }).catch(async () => {
        const cached = await caches.match(request);
        return cached || new Response('Offline', { status: 503 });
      })
    );
    return;
  }

  // Estratégia stale-while-revalidate para outros assets estáticos
  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(request);
      const fetchPromise = fetch(request).then(response => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          cache.put(request, response.clone());
        }
        return response;
      }).catch(() => null);

      return cached || fetchPromise || new Response('Offline', { status: 503 });
    })
  );
});

// Recebe mensagem para limpar cache
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  if (event.data === 'clearCache') {
    caches.delete(CACHE_NAME);
  }
});
