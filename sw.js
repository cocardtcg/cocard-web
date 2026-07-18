const CACHE_NAME = 'cocard-images-v3';
const IMAGE_HOST = 'www.takaratomy.co.jp';
const THUMB_HOST = 'cocardtcg.github.io';
const MAX_ENTRIES = 2000;

// 캐시 대상: 타카라토미 카드 원본 + carddata 썸네일(WebP)
function isCardImage(url) {
  if (url.hostname === IMAGE_HOST) return url.pathname.includes('/storage/card/');
  if (url.hostname === THUMB_HOST) return url.pathname.includes('/carddata/v1/thumbs/');
  return false;
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('cocard-images-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Trim cache to MAX_ENTRIES, removing oldest first
async function trimCache() {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  if (keys.length > MAX_ENTRIES) {
    const toDelete = keys.length - MAX_ENTRIES;
    for (let i = 0; i < toDelete; i++) {
      await cache.delete(keys[i]);
    }
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only cache card images (takaratomy originals + carddata thumbnails)
  if (!isCardImage(url)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then(async (cached) => {
        if (cached) {
          // Move to end by re-putting (LRU refresh)
          cache.delete(event.request).then(() => {
            cache.put(event.request, cached.clone());
          });
          // Add CORS headers so html2canvas can read the image data
          const headers = new Headers(cached.headers);
          headers.set('Access-Control-Allow-Origin', '*');
          return new Response(await cached.blob(), {
            status: cached.status,
            statusText: cached.statusText,
            headers,
          });
        }

        return fetch(event.request).then((response) => {
          if (response.ok && response.headers.get('content-type')?.startsWith('image/')) {
            cache.put(event.request, response.clone());
            // Trim in background, don't block response
            trimCache();
          }
          return response;
        });
      })
    )
  );
});
