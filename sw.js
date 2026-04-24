/**
 * SERVICE WORKER store famBARLA
 * Architecture: Network-First (HTML), Cache-First (CDN), Stale-While-Revalidate (Dynamic)
 * Feature: Safe Offline Fallback, Strict Memory Trimmer, App Window Manager
 */

const APP_VERSION = '1.9';

const CACHE_CORE = 'fambarla-core-v' + APP_VERSION; 
const CACHE_DYNAMIC = 'fambarla-dynamic-v' + APP_VERSION;
const MAX_DYNAMIC_ITEMS = 50; 

const coreUrls = [
  './',
  './index.html',
  './manifest.json'
];

const cdnDomains = [
  'tailwindcss.com',
  'cdnjs.cloudflare.com',
  'unpkg.com',
  'fonts.googleapis.com', 
  'fonts.gstatic.com'
];

/**
 * FUNGSI: Memangkas cache dinamis agar memori HP tidak penuh
 */
async function trimCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
      const itemsToDelete = keys.slice(0, keys.length - maxItems);
      await Promise.all(itemsToDelete.map(key => cache.delete(key)));
    }
  } catch (e) {
    console.error('Trim Cache Error:', e);
  }
}

// ==========================================
// EVENT: INSTALL (Mempersiapkan File Inti)
// ==========================================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_CORE).then(cache => {
      return Promise.all(coreUrls.map(async url => {
        try {
          const req = new Request(url, { cache: 'reload' });
          const res = await fetch(req);
          if (res && res.ok) {
            await cache.put(req, res);
          }
        } catch (error) {
          console.error('Gagal pre-cache:', url, error);
        }
      }));
    }).then(() => self.skipWaiting())
  );
});

// ==========================================
// EVENT: ACTIVATE (Membuang Cache Versi Lama)
// ==========================================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.map(key => {
        if (key.startsWith('fambarla-') && key !== CACHE_CORE && key !== CACHE_DYNAMIC) {
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim()) 
  );
});

// ==========================================
// EVENT: FETCH (Pengatur Lalu Lintas Data)
// ==========================================
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Abaikan request API & Non-GET
  if (req.method !== 'GET' || url.pathname.endsWith('sw.js') || url.hostname === 'script.google.com' || !url.protocol.startsWith('http')) {
    return;
  }

  // ---------------------------------------------------------
  // STRATEGI 1: Network-First (Khusus File HTML & Manifest)
  // ---------------------------------------------------------
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('index.html') || url.pathname.endsWith('manifest.json')) {
    event.respondWith(
      fetch(req).then(res => {
        if (!res || (res.status !== 200 && res.status !== 0 && res.type !== 'opaqueredirect')) {
          throw new Error('Invalid response');
        }
        const resClone = res.clone();
        caches.open(CACHE_CORE).then(cache => cache.put(req, resClone));
        return res;
      }).catch(async () => {
        // Fallback Offline
        const cachedRes = await caches.match(req, { ignoreSearch: true }) || 
                          await caches.match('./', { ignoreSearch: true }) || 
                          await caches.match('./index.html', { ignoreSearch: true });
        
        if (cachedRes) return cachedRes;

        // Fallback Darurat untuk Manifest
        if (url.pathname.endsWith('manifest.json')) {
          return new Response('{"name":"store famBARLA","short_name":"famBARLA","display":"standalone","start_url":"./"}', { 
            headers: { 'Content-Type': 'application/json' } 
          });
        }
        
        return new Response('Aplikasi sedang offline. Tidak ada data di cache.', { status: 503, statusText: 'Offline' });
      })
    );
    return;
  }

  // ---------------------------------------------------------
  // STRATEGI 2: Cache-First (Khusus Library CDN & Font)
  // ---------------------------------------------------------
  if (cdnDomains.some(domain => url.hostname.includes(domain))) {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then(cachedRes => {
        if (cachedRes) return cachedRes; 
        
        return fetch(req).then(res => {
          if (!res || (res.status !== 200 && res.status !== 0)) return res;
          
          const resClone = res.clone();
          caches.open(CACHE_CORE).then(cache => cache.put(req, resClone));
          return res;
        }).catch(() => new Response('', { status: 503, statusText: 'Offline' })); 
      })
    );
    return;
  }

  // ---------------------------------------------------------
  // STRATEGI 3: Stale-While-Revalidate (File Statis Lainnya)
  // ---------------------------------------------------------
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cachedRes => {
      const fetchPromise = fetch(req).then(res => {
        if (res && (res.status === 200 || res.status === 0)) {
          const resClone = res.clone();
          caches.open(CACHE_DYNAMIC).then(cache => {
            cache.put(req, resClone).then(() => {
              // Pemangkasan memori dijalankan tanpa memblokir proses fetch
              trimCache(CACHE_DYNAMIC, MAX_DYNAMIC_ITEMS);
            });
          });
        }
        return res;
      }).catch(() => new Response('', { status: 503, statusText: 'Offline' }));

      // Kembalikan versi cache jika ada, dan biarkan fetch berjalan untuk update di latar belakang
      return cachedRes || fetchPromise;
    })
  );
});

// ==========================================
// FITUR: Hook Pengendali Aplikasi
// ==========================================
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('./');
      }
    })
  );
});
