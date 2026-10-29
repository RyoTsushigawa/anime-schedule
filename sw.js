// Service worker for the home screen app. The page's own files are fetched fresh from GitHub every
// time (so a new version shows right away, without Ctrl+F5) and kept as a copy for when there's no
// internet. AniList, Google and LiveChart requests aren't touched: the page keeps its own copies.
const CACHE = 'schedule-v49';
const FILES = ['./', 'index.html', 'style.css', 'common.js', 'app.js', 'planner.html', 'planner.js', 'xlsx.js', 'streams-de.json', 'config.json', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', event => {
  // 'reload' skips the browser's HTTP cache, so the offline copy is this version and not the one
  // before; each file on its own, so one that fails doesn't leave the app without any offline copy.
  event.waitUntil(caches.open(CACHE).then(cache =>
    Promise.all(FILES.map(f => cache.add(new Request(f, { cache: 'reload' })).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })
        .then(cached => cached || (request.mode === 'navigate' ? caches.match('./') : Response.error())))
  );
});
