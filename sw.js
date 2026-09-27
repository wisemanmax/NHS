// Offline support. The app shell is served cache-first and refreshed in the background;
// data files and pages are network-first with a short timeout, then fall back to the cache.
// Map tiles and OpenStreetMap searches are never cached here.
const VERSION = 'nextstop-v1';

const SHELL = [
  './',
  'index.html',
  'app.css',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/leaflet.css',
  'js/app.js',
  'js/brands.js',
  'js/deals.js',
  'js/format.js',
  'js/geo.js',
  'js/hours.js',
  'js/map.js',
  'js/osm.js',
  'js/overpass.js',
  'js/rank.js',
  'js/state.js',
  'js/views.js',
];
const DATA = ['data/areas.json', 'data/brands.json', 'data/deals.json', 'data/events.json', 'data/stores.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await cache.addAll(SHELL);
      // Data files are best-effort: the store list may not exist yet.
      await Promise.all(DATA.map((url) => cache.add(url).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(VERSION);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(fallbackUrl || request, res.clone());
      return res;
    })
    .catch(() => null);
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 4000));
  const fast = await Promise.race([network, timeout]);
  if (fast) return fast;
  const cached = await cache.match(fallbackUrl || request, { ignoreSearch: true });
  if (cached) return cached;
  return (await network) || new Response('Offline', { status: 503, statusText: 'Offline' });
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || new Response('Offline', { status: 503, statusText: 'Offline' });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, new URL('index.html', self.registration.scope).href));
  } else if (url.pathname.includes('/data/')) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});
