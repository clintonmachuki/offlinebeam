const CACHE_NAME = 'offlinebeam-v1';
const APP_SHELL = [
  './', './index.html', './styles.css', './app.js', './manifest.webmanifest', './icon.svg',
  './vendor/QRMode.js', './vendor/QRErrorCorrectLevel.js', './vendor/QRMaskPattern.js',
  './vendor/QRMath.js', './vendor/QRBitBuffer.js', './vendor/QR8bitByte.js',
  './vendor/QRPolynomial.js', './vendor/QRRSBlock.js', './vendor/QRUtil.js', './vendor/qrcode.js'
];
const SCANNER_URL = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.href === SCANNER_URL) {
    event.respondWith(caches.open(CACHE_NAME).then(async cache => {
      const saved = await cache.match(event.request);
      try {
        const fresh = await fetch(event.request);
        if (fresh && fresh.ok) await cache.put(event.request, fresh.clone());
        return fresh;
      } catch (_) {
        if (saved) return saved;
        throw new Error('Scanner library is not cached yet. Open the app once while online.');
      }
    }));
    return;
  }
  if (url.origin === self.location.origin && event.request.method === 'GET') {
    event.respondWith(caches.match(event.request).then(saved => saved || fetch(event.request).then(response => {
      if (response && response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)); }
      return response;
    }).catch(() => caches.match('./index.html'))));
  }
});