'use strict';

// Pliki potrzebne do działania bez internetu. Zawsze najpierw próbujemy sieci,
// żeby użytkownik dostawał najnowszą wersję, a z pamięci korzystamy tylko offline.
const CACHE = 'rowerowy-niezbednik';
const APP_FILES = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'races-2027.js',
  'kolarz.jpg',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  // Pogoda i linki do organizatorów idą prosto do sieci.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const cached = await cache.match(req, { ignoreSearch: true })
        || (req.mode === 'navigate' ? await cache.match('./') : undefined);
      if (cached) return cached;
      throw err;
    }
  })());
});
