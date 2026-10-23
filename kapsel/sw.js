// Offline-Fähigkeit: Die App-Hülle kommt aus dem Cache und wird im
// Hintergrund erneuert. Anfragen an GitHub gehen immer ins Netz.
const VERSION = 'kapsel-1';
const HUELLE = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/daten.js',
  'js/github.js',
  'js/glas.js',
  'js/haptik.js',
  'js/speicher.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(HUELLE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const treffer = await cache.match(e.request, { ignoreSearch: true });
      const netz = fetch(e.request)
        .then((antwort) => {
          if (antwort.ok) cache.put(e.request, antwort.clone());
          return antwort;
        })
        .catch(() => treffer);
      return treffer ?? netz;
    }),
  );
});
