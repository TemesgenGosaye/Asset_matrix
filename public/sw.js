const CACHE_NAME = 'asset-tracker-v2';
const OFFLINE_URL = '/offline';

const OFFLINE_FALLBACK_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Offline</title>
  </head>
  <body>
    <h1>You are offline</h1>
    <p>This page is not available offline. Reconnect to continue.</p>
  </body>
</html>`;

const OFFLINE_FALLBACK_RESPONSE = () =>
  new Response(OFFLINE_FALLBACK_HTML, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });

// Static assets to pre-cache
// The app root is a redirect to /login (or /dashboard when a session exists),
// so precaching it would store a redirect response rather than a document.
// /login is the one page every visitor must reach offline.
const PRECACHE_URLS = [
  '/login',
  '/offline',
  '/manifest.json',
  '/icons/icon.svg',
];

// Install event - pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// --- IndexedDB helpers for offline mutation queue (raw IDB, no library in SW) ---
const IDB_NAME = 'asset-tracker-offline';
const IDB_STORE = 'mutation-queue';

function openQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeInQueue(entry) {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(entry, entry.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Fetch event - network first for pages, cache first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-http(s) schemes (e.g. chrome-extension)
  if (!url.protocol.startsWith('http')) return;

  // For non-GET API requests: try network, queue on failure
  if (request.method !== 'GET' && url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request.clone()).catch(async () => {
        try {
          const body = await request.clone().text();
          const entry = {
            id: crypto.randomUUID(),
            url: request.url,
            method: request.method,
            headers: Object.fromEntries(request.headers.entries()),
            body: body || null,
            timestamp: Date.now(),
            retryCount: 0,
          };
          await storeInQueue(entry);
          // Notify all clients
          const clients = await self.clients.matchAll();
          clients.forEach((c) => c.postMessage({ type: 'MUTATION_QUEUED' }));
          return new Response(JSON.stringify({ queued: true, id: entry.id }), {
            status: 202,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch {
          return new Response(JSON.stringify({ error: 'Offline and queue failed' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      })
    );
    return;
  }

  // Skip non-GET requests that aren't API calls
  if (request.method !== 'GET') return;

  // Skip API requests and auth
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/api/auth')) return;

  // For navigation requests (HTML pages) - network first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            return caches.match(OFFLINE_URL).then((offlinePage) => {
              if (offlinePage) return offlinePage;
              // `/` is not precached and never will be — it is a redirect to
              // /login (or /dashboard with a session), so a cached copy would be
              // a redirect response rather than a document. /login IS precached,
              // so an offline visitor lands on the real sign-in screen instead of
              // the generic offline stub.
              return caches.match(PRECACHE_URLS[0]).then((shell) => {
                return shell || OFFLINE_FALLBACK_RESPONSE();
              });
            });
          });
        })
    );
    return;
  }

  // For static assets - stale while revalidate
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|woff2?)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached || OFFLINE_FALLBACK_RESPONSE());
        return cached || fetchPromise;
      })
    );
    return;
  }
});
