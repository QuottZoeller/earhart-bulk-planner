// Bump this on every deploy that changes any precached file so old clients
// pick up the new version instead of serving stale JS forever.
const CACHE_VERSION = 'v2';
const SHELL_CACHE = `ebp-shell-${CACHE_VERSION}`;
const DATA_CACHE = `ebp-data-${CACHE_VERSION}`;

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './js/api.js',
  './js/app.js',
  './js/barcode.js',
  './js/carryout.js',
  './js/chart.js',
  './js/dom.js',
  './js/exportImport.js',
  './js/history.js',
  './js/locations.js',
  './js/log.js',
  './js/modal.js',
  './js/myfoods.js',
  './js/planner.js',
  './js/planState.js',
  './js/router.js',
  './js/settings.js',
  './js/storage.js',
  './js/suggest.js',
  './js/swipe.js',
  './js/toast.js',
  './js/util.js',
  './js/views/home.js',
  './js/views/log.js',
  './js/views/progress.js',
  './js/views/settings.js',
  './js/weight.js',
];

const DATA_FILES = ['./data/menus.json', './data/nutrition.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shellCache = await caches.open(SHELL_CACHE);
      await shellCache.addAll(SHELL_FILES);
      const dataCache = await caches.open(DATA_CACHE);
      // Best-effort: don't fail install if data files aren't reachable yet.
      await Promise.allSettled(DATA_FILES.map((f) => dataCache.add(f)));
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE)
          .map((k) => caches.delete(k))
      );
      self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  const isDataFile = DATA_FILES.some((f) => url.pathname.endsWith(f.replace('./', '/')));

  if (isDataFile) {
    // Network-first so the daily-updated menu/nutrition JSON is fresh
    // whenever online, falling back to the last cached copy offline.
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(event.request);
          const cache = await caches.open(DATA_CACHE);
          cache.put(event.request, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          throw new Error('offline and no cached data available');
        }
      })()
    );
    return;
  }

  // App shell: cache-first, refreshing the cache in the background so the
  // next load picks up changes without blocking this one.
  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request);
      const networkFetch = fetch(event.request)
        .then((res) => {
          if (res && res.ok) caches.open(SHELL_CACHE).then((c) => c.put(event.request, res.clone()));
          return res;
        })
        .catch(() => null);
      return cached || (await networkFetch) || new Response('Offline', { status: 503 });
    })()
  );
});
