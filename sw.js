/* Kirim Doa — service worker: cache aset statik sahaja.
 * Data doa TIDAK dicache (peribadi & sentiasa daripada pelayan; permintaan API ke Google tidak disentuh).
 * Nama cache & senarai aset diisi oleh tools/build-web.js (pemegang tempat di bawah). */
var CACHE = "kirimdoa-1.5.2-85228132f2";
var ASSETS = ["./","index.html","config.js","assets/app.90504667b3.js","assets/app.d2e02b9ad6.css","offline.html","manifest.webmanifest","icons/apple-touch-icon.png","icons/favicon-32.png","icons/icon-192.png","icons/icon-512.png","icons/maskable-512.png","icons/shortcut-book.png","icons/shortcut-link.png","icons/shortcut-send.png"];
var FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';

// Notifikasi telefon (FCM): aktif hanya jika config.js mempunyai konfigurasi Firebase.
// SDK memaparkan notifikasi latar belakang secara automatik & membuka fcm_options.link apabila diklik.
try { importScripts('config.js'); } catch (e) { /* tiada config */ }
(function () {
  var c = self.KIRIM_DOA_CONFIG || {};
  var fb = c.firebase || {};
  if (!(fb.projectId && fb.apiKey && fb.messagingSenderId && fb.appId)) return;
  try {
    importScripts(FIREBASE_SDK + 'firebase-app-compat.js', FIREBASE_SDK + 'firebase-messaging-compat.js');
    firebase.initializeApp(fb);
    firebase.messaging();
  } catch (e) { /* luar talian semasa pemasangan — dicuba semula pada kemas kini seterusnya */ }
})();

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
