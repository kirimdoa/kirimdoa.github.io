/* Kirim Doa — service worker: cache aset statik sahaja.
 * Data doa TIDAK dicache (peribadi & sentiasa daripada pelayan; permintaan API ke Google tidak disentuh).
 * kirimdoa-1.1.0-4a322847fa dan ["./","index.html","config.js","assets/app.6112447057.js","assets/app.d7e13c0e45.css","offline.html","manifest.webmanifest","icons/apple-touch-icon.png","icons/favicon-32.png","icons/icon-192.png","icons/icon-512.png","icons/maskable-512.png"] diisi oleh tools/build-web.js. */
var CACHE = '__CACHE__';
var ASSETS = __ASSETS__;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return; // jangan sentuh permintaan Google
  if (req.mode === 'navigate') {
    // Rangkaian dahulu (sentiasa versi terkini); jika luar talian → halaman offline
    e.respondWith(fetch(req).catch(function () { return caches.match('offline.html'); }));
    return;
  }
  // Aset statik: cache dahulu, kemas kini di latar
  e.respondWith(caches.match(req).then(function (hit) {
    var net = fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () { return hit; });
    return hit || net;
  }));
});
