// Sea Battle service worker. The build stamps in the build id and the precache list
// (src/build/sw-plugin.ts). Paths in PRECACHE are relative to this worker's scope.
const BUILD_ID = __BUILD_ID__;
const PRECACHE = __PRECACHE__;
const PREFIX = 'bship-';
const CACHE = PREFIX + BUILD_ID;

// Updates take over at once (skipWaiting + clients.claim), so a page may be running an older build
// while the new worker serves it. That is safe only because the app is one JS bundle (no lazy
// chunks to go missing) and a stale game doc is handled by the version checks (R9).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((p) => new Request(new URL(p, self.registration.scope), { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Network first so a new build arrives on the next load; the cached shell when offline.
    event.respondWith(
      fetch(req, { cache: 'no-cache' }).catch(async () => {
        const cache = await caches.open(CACHE);
        return (
          (await cache.match(new URL('./', self.registration.scope).href, { ignoreVary: true })) ||
          (await cache.match(new URL('index.html', self.registration.scope).href, { ignoreVary: true })) ||
          Response.error()
        );
      }),
    );
    return;
  }

  // Assets are content-hashed: cache first, else the network. Some servers send `Vary: Origin`,
  // which would make a precached copy miss for a CORS-mode module request.
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(req, { ignoreVary: true }))
      .then((hit) => hit || fetch(req)),
  );
});
