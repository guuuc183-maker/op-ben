// 离线缓存：有网时总是取最新版本，没网时用手机上的缓存
const CACHE = 'opben-v7';
const SHELL = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'js/app.js', 'js/db.js', 'js/util.js', 'js/photo.js', 'js/config.js', 'js/firebase.js',
  'fonts/bc-600.woff2', 'fonts/bc-700.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/icon-48.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('opben-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then(res => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(h => h || caches.match('index.html')))
  );
});
