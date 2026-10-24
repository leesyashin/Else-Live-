// Offline-Fähigkeit: Die App-Hülle kommt zuerst frisch aus dem Netz und nur
// ohne Verbindung aus dem Cache, damit Updates sofort ankommen. Anfragen an
// GitHub gehen immer ins Netz.
// three.js und das Auto-Modell (vendor/, modelle/) sind groß und tragen ihre
// Version im Namen; sie kommen aus einem eigenen Cache, der Updates der Hülle
// übersteht, und werden erst geladen, wenn jemand die Küste wählt. Ändert
// sich eine davon, bekommt sie einen neuen Namen und DAUER zählt hoch.
const VERSION = 'kapsel-17';
const DAUER = 'kapsel-dauer-1';
const GROSS = /\/(vendor|modelle)\//;
const HUELLE = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/daten.js',
  'js/github.js',
  'js/hintergrund.js',
  'js/ascii-porsche.js',
  'js/kueste.js',
  'js/haptik.js',
  'js/speicher.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' umgeht den HTTP-Cache, sonst landen alte Dateien im neuen Cache.
  const frisch = HUELLE.map((url) => new Request(url, { cache: 'reload' }));
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(frisch)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== VERSION && n !== DAUER).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (GROSS.test(url.pathname)) {
    e.respondWith(
      caches.open(DAUER).then(async (cache) => {
        const da = await cache.match(e.request, { ignoreSearch: true });
        if (da) return da;
        const antwort = await fetch(e.request);
        if (antwort.ok) cache.put(e.request, antwort.clone());
        return antwort;
      }),
    );
    return;
  }
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      try {
        const antwort = await fetch(e.request, { cache: 'no-cache' });
        if (antwort.ok) cache.put(e.request, antwort.clone());
        return antwort;
      } catch {
        return (await cache.match(e.request, { ignoreSearch: true })) ?? Response.error();
      }
    }),
  );
});
