const CACHE_NAME = 'asset-tracker-v4';
const RSC_CACHE_NAME = 'asset-tracker-v4-rsc';
const OFFLINE_URL = '/offline';

// Last-resort document, rendered only when a navigation fails AND neither the
// cached page nor /offline is available. It must be entirely self-contained:
// no stylesheet, font, image or script request can succeed here, so the mark is
// inline SVG and the styling is inlined. It mirrors the standalone /offline
// screen so a user who lands here sees the same product, not a bare <h1>.
const OFFLINE_FALLBACK_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0b2b57" />
    <title>Connect to the internet — HomeDesk</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        min-height: 100dvh; padding: 2rem 1.5rem; text-align: center;
        background: #f8fafc; color: #0f172a;
      }
      .icon {
        display: grid; place-items: center; width: 104px; height: 104px;
        border-radius: 9999px; background: #fef2f2; border: 1px solid #fecaca;
        color: #dc2626; box-shadow: 0 0 0 12px rgba(254,242,242,0.6);
      }
      .icon svg { width: 44px; height: 44px; }
      h1 { margin-top: 2rem; font-size: 1.35rem; font-weight: 700; letter-spacing: -0.01em; }
      .sub { margin-top: 0.4rem; font-size: 0.95rem; font-weight: 600; color: #334155; }
      p.msg { margin-top: 0.85rem; max-width: 24rem; font-size: 0.875rem; line-height: 1.65; color: #64748b; }
      button {
        margin-top: 2rem; min-height: 50px; width: 100%; max-width: 20rem;
        padding: 0.75rem 1.75rem; font: inherit; font-size: 0.95rem; font-weight: 600;
        color: #fff; background: #0b2b57; border: none; border-radius: 14px; cursor: pointer;
        box-shadow: 0 6px 18px rgba(11,43,87,0.24);
      }
      button:active { transform: scale(0.98); }
    </style>
  </head>
  <body>
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"
        stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 20h.01" />
        <path d="M8.5 16.429a5 5 0 0 1 7 0" />
        <path d="M5 12.859a10 10 0 0 1 5.17-2.69" />
        <path d="M19 12.859a10 10 0 0 0-2.007-1.523" />
        <path d="M2 8.82a15 15 0 0 1 4.177-2.643" />
        <path d="M22 8.82a15 15 0 0 0-11.288-3.764" />
        <path d="m2 2 20 20" />
      </svg>
    </div>
    <h1>Connect to the internet</h1>
    <p class="sub">You&rsquo;re offline. Check your connection.</p>
    <p class="msg">This page isn&rsquo;t available offline yet. Turn on Wi-Fi or mobile data, then retry.</p>
    <button type="button" onclick="location.reload()">Retry</button>
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

// Pre-cache individually so a single failure (e.g. installing while offline)
// can never abort the whole service worker install. Previously a failed
// addAll() left the app with no worker at all and forced the native shell to
// fall back to its error page.
async function precache() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    PRECACHE_URLS.map(async (url) => {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (!response.ok) return;
        // When a session already exists /login redirects to /dashboard. Do not
        // cache that document under the /login key.
        if (url === '/login' && new URL(response.url).pathname !== '/login') return;
        await cache.put(url, response.clone());
      } catch {
        // Ignore: the page will be cached on the next successful visit.
      }
    })
  );
}

// Install event - pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(precache());
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== RSC_CACHE_NAME)
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

  // For non-GET API requests: try network, queue on failure.
  // Auth endpoints are never queued: storing sign-in/sign-out credentials in
  // IndexedDB is a security risk and replaying them later is meaningless.
  if (request.method !== 'GET' && url.pathname.startsWith('/api/')) {
    if (url.pathname.startsWith('/api/auth')) {
      event.respondWith(
        fetch(request.clone()).catch(
          () =>
            new Response(
              JSON.stringify({ error: 'You are offline. Reconnect and try again.' }),
              {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              }
            )
        )
      );
      return;
    }

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
          return caches.match(request, { ignoreSearch: true }).then(async (cached) => {
            if (cached) return cached;

            // The native shell boots on /login?app=1. When offline, serve the
            // cached sign-in document (which owns the offline UI) rather than
            // the generic offline stub.
            if (url.searchParams.get('app') === '1') {
              const login = await caches.match('/login', { ignoreSearch: true });
              if (login) return login;
            }

            const offlinePage = await caches.match(OFFLINE_URL, { ignoreSearch: true });
            if (offlinePage) return offlinePage;

            // `/` is not precached and never will be — it is a redirect to
            // /login (or /dashboard with a session), so a cached copy would be
            // a redirect response rather than a document. /login IS precached,
            // so an offline visitor lands on the real sign-in screen instead of
            // the generic offline stub.
            const shell = await caches.match(PRECACHE_URLS[0], { ignoreSearch: true });
            return shell || OFFLINE_FALLBACK_RESPONSE();
          });
        })
    );
    return;
  }

  // React Server Component payloads power client-side navigation. They are
  // cached separately from documents because the Cache API keys on URL only:
  // storing an RSC payload under /dashboard would overwrite the cached HTML
  // document for the same URL.
  const isRscRequest =
    url.searchParams.has('_rsc') ||
    request.headers.get('RSC') === '1' ||
    request.headers.get('Next-Router-State-Tree') !== null;

  if (isRscRequest) {
    const rscKey = new Request(url.origin + url.pathname + '?__rsc=1');
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(RSC_CACHE_NAME).then((cache) => cache.put(rscKey, clone));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(RSC_CACHE_NAME);
          const cached = await cache.match(rscKey, { ignoreSearch: true });
          if (cached) return cached;
          return new Response('', {
            status: 503,
            headers: { 'Content-Type': 'text/x-component; charset=utf-8' },
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
