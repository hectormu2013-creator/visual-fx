// Visual-FX Service Worker - Network First (Siempre versión más reciente)
const CACHE_NAME = 'visual-fx-live-v6';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Ignorar API o Proxy de streams HLS
  if (event.request.url.includes('/api/') || event.request.url.includes('stream') || event.request.url.includes('.m3u8')) {
    return;
  }
  // Estrategia Network-First: Siempre pedir a la red primero para ver cambios de código inmediatamente
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
