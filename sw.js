/**
 * SERVICE WORKER STORE famBARLA (KASIR VERSION v30.0)
 * Fitur: PWA Offline Ready, Network Security Bugfix, Cache Management
 */

const APP_VERSION = '30.0'; 

const CACHE_STATIC = 'fambarla-kasir-static-v' + APP_VERSION;
const CACHE_DYNAMIC = 'fambarla-kasir-dynamic-v' + APP_VERSION;

// Aset statis disesuaikan dengan skrip aplikasi kasir Anda
const staticAssets = [
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://unpkg.com/html5-qrcode'
];

const dynamicAssets = [
  './',
  './index.html',
  './manifest.json',
  // Pastikan Anda menyiapkan gambar icon ini di folder yang sama agar PWA bisa diinstal
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting(); 
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_STATIC).then(cache => cache.addAll(staticAssets)),
      caches.open(CACHE_DYNAMIC).then(cache => cache.addAll(dynamicAssets))
    ])
  );
});

self.addEventListener('activate', event => {
  self.clients.claim(); 
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_STATIC && key !== CACHE_DYNAMIC) return caches.delete(key);
        })
      );
    })
  );
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // ========================================================
  // A. FILTER KEAMANAN JARINGAN (ANTI-CRASH & BOM WAKTU)
  // ========================================================
  // 1. Jangan cache sw.js itu sendiri
  if (requestUrl.pathname.endsWith('sw.js')) return;
  // 2. WAJIB: Abaikan semua request kecuali GET (Mencegah POST error saat upload ke Cloud)
  if (event.request.method !== 'GET') return;
  // 3. WAJIB: Abaikan URL alien dari ekstensi browser
  if (!requestUrl.protocol.startsWith('http')) return;

  // B. JALUR KHUSUS GOOGLE SHEETS (Bypass cache agar upload/download cloud selalu fresh)
  if (requestUrl.hostname === 'script.google.com') {
    event.respondWith(fetch(event.request));
    return;
  }

  // C. BRANKAS STATIS (Cache First)
  // Menangkap request dari CDN Tailwind, FontAwesome, SheetJS, dan Html5-Qrcode
  if (staticAssets.some(url => event.request.url.includes(url)) || 
      requestUrl.hostname === 'cdn.tailwindcss.com' || 
      requestUrl.hostname === 'cdnjs.cloudflare.com' || 
      requestUrl.hostname === 'unpkg.com') {
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true }).then(cachedResponse => {
        return cachedResponse || fetch(event.request).then(networkResponse => {
          if (networkResponse && (networkResponse.status === 200 || networkResponse.status === 0)) {
            caches.open(CACHE_STATIC).then(cache => cache.put(event.request, networkResponse.clone()));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // D. BRANKAS DINAMIS (True Stale-While-Revalidate)
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(cachedResponse => {
      const networkFetch = fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_DYNAMIC).then(cache => cache.put(event.request.url.split('?')[0], responseToCache));
        }
        return networkResponse;
      }).catch(() => {
        // Fallback jika tidak ada internet, arahkan kembali ke index.html
        if (event.request.mode === 'navigate') return caches.match('./index.html', { ignoreSearch: true });
      });

      if (cachedResponse) {
        event.waitUntil(networkFetch); 
        return cachedResponse; 
      }
      return networkFetch; 
    })
  );
});
