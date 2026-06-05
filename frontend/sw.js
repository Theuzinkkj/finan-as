'use strict';

const CACHE_NAME = 'atlas-v11';
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
  '/css/enhancements.css',
  '/css/mobile.css',
  '/css/desktop.css',
  '/js/storage.js',
  '/js/config.js',
  '/js/api.js',
  '/js/login.js',
  '/js/app.js',
  '/js/ai.js',
  '/js/charts.js',
  '/js/investments.js',
  '/js/export.js',
  '/js/csv-import.js',
  '/js/enhancements.js',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512.svg',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
];

self.addEventListener('install', event => {
  // skipWaiting imediato: garante que novos deploys entrem em vigor sem
  // depender do usuário clicar em "Atualizar" — essencial para a página de
  // login, que não exibe o banner de atualização.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(PRECACHE.map(url => cache.add(url)))
    )
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

  // API passa direto para a rede; erros são tratados pelo cliente HTTP.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Navegação, JS e CSS: network-first para aplicar deploys imediatamente.
  if (request.mode === 'navigate' ||
      url.pathname.startsWith('/js/') ||
      url.pathname.startsWith('/css/')) {
    event.respondWith(
      fetch(request).then(response => {
        if (response && response.status === 200) {
          caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
        }
        return response;
      }).catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match(OFFLINE_URL);
        return new Response('Offline', { status: 503 });
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
