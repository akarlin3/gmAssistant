const CACHE_NAME = 'gm-assistant-pwa-v1';

const PRECACHE_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/maskable-icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/maskable-icon-512x512.png',
  '/icons/base-icon.svg',
];

const BYPASS_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'firebaseremoteconfig.googleapis.com',
  'firebasestorage.googleapis.com',
  'apis.google.com',
  'accounts.google.com',
];

function shouldBypassCache(request, url) {
  if (request.method !== 'GET') return true;
  if (!url.protocol.startsWith('http')) return true;

  // Explicitly bypass Firebase Auth, Firestore, and Google auth/sync hosts
  if (
    BYPASS_HOSTS.some(
      (host) => url.hostname === host || url.hostname.endsWith('.' + host)
    ) ||
    url.hostname.endsWith('.firebaseio.com') ||
    url.hostname.endsWith('.googleapis.com')
  ) {
    return true;
  }

  // Explicitly bypass all /api/ routes
  if (url.pathname.startsWith('/api/')) {
    return true;
  }

  return false;
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        PRECACHE_ASSETS.map((assetUrl) =>
          fetch(assetUrl, { cache: 'no-cache' }).then((response) => {
            if (response && response.ok) {
              return cache.put(assetUrl, response);
            }
          })
        )
      )
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (shouldBypassCache(request, url)) {
    return;
  }

  const isNavigation =
    request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html');
  const isNextStatic = url.pathname.startsWith('/_next/static/');
  const isSameOrigin = url.origin === self.location.origin;

  if (!isNavigation && !isNextStatic && !isSameOrigin) {
    return;
  }

  // Network-First with Cache Fallback strategy for navigation/HTML,
  // /_next/static/ assets, and same-origin static resources.
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (networkResponse.type === 'basic' || networkResponse.type === 'cors')
        ) {
          const responseClone = networkResponse.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, responseClone))
            .catch(() => {});
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }

        if (isNavigation) {
          const rootFallback = await caches.match('/');
          if (rootFallback) {
            return rootFallback;
          }
        }

        return new Response('Offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })
  );
});
