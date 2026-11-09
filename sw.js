// Offline cache for the app shell. Bump VERSION when any shell file changes.
const VERSION = 'sf-notebook-v16';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/game-data.js',
  'js/state.js',
  'js/storage.js',
  'js/rules.js',
  'assets/icon-192.png',
  'assets/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sf-notebook-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

// Stale-while-revalidate: answer from cache instantly (fast offline), refresh cache in background.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const network = fetch(req).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
    }
    return res;
  });
  e.waitUntil(network.then(() => {}, () => {}));
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) =>
      hit || network.catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error())),
    ),
  );
});
