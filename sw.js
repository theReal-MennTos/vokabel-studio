// Service Worker: App offline verfügbar machen.
// Bei jeder Änderung an App-Dateien VERSION erhöhen.
// Cache-Name enthält den Pfad, damit Live- und Beta-Version sich nicht gegenseitig löschen
const PREFIX = 'vs-' + new URL(self.registration.scope).pathname + '-';
const VERSION = PREFIX + '2.5.0';
const DATEIEN = [
  './', 'index.html', 'diagnose.html', 'manifest.webmanifest',
  'css/app.css',
  'js/app.js', 'js/db.js', 'js/util.js', 'js/faecher.js', 'js/import.js',
  'js/prompt.js', 'js/backup.js', 'js/speech.js', 'js/views.js', 'js/import-view.js',
  'js/config.js', 'js/lernen.js', 'js/belohnung.js', 'js/latein.js', 'js/lern-views.js', 'js/plan-views.js', 'js/sicherung.js', 'js/design.js', 'js/avatare.js', 'js/effekte.js', 'js/ki.js', 'js/pakete.js', 'js/teilen-views.js',
  'demo/demo-englisch.json', 'demo/demo-latein.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => (k.startsWith(PREFIX) && k !== VERSION) || /^vs-\d/.test(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Netz zuerst (damit Updates ankommen), bei Offline aus dem Cache.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // cache: 'no-cache' = beim Server nachfragen, ob es eine neuere Datei gibt (sonst liefert der Browser bis zu 10 Min. alte Dateien)
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((res) => {
        const kopie = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, kopie));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
