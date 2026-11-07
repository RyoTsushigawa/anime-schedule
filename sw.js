// Service worker for the home screen app. The page itself opens from the saved copy, so it appears right
// away, and is refreshed in the background for the next visit. A published version with a new CACHE name
// is fetched as a whole and offers "Reload" (app.js). Data files still come fresh, with the saved copy
// standing in when the network is slow or down. AniList, Google and LiveChart requests aren't touched:
// the page keeps its own copies.
const CACHE = 'schedule-v219';
const FILES = ['./', 'index.html', 'services/crunchyroll.svg', 'services/netflix.svg', 'services/prime-video.svg', 'services/disney.svg', 'services/adn.svg', 'services/youtube.svg', 'services/akiba.svg', 'services/hidive.svg', 'services/aniworld.png', 'services/subsplease.png', 'services/nyaa.png', 'services/0neko.ico', 'style.css', 'frame-guard.js', 'early.js', 'common.js', 'mal.js', 'app.js', 'drag-moves.js', 'streams-de.json', 'fallback-links.json', 'config.json', 'manifest.webmanifest', 'icon-72.png'];

self.addEventListener('install', event => {
  // 'reload' skips the browser's HTTP cache, so the offline copy is this version and not the one
  // before; each file on its own, so one that fails doesn't leave the app without any offline copy.
  event.waitUntil(caches.open(CACHE).then(cache =>
    Promise.all(FILES.map(f => cache.add(new Request(f, { cache: 'reload' })).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => /^schedule-v\d+$/.test(k) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const SLOW_NETWORK_MS = 1500;
const SCOPE = new URL('./', location);
const isPageFile = (request, url) => request.mode === 'navigate' || /\.(html|css|js|webmanifest|png)$/.test(url.pathname);

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  // Saved without the query, so "?v=2" can't leave an older copy behind and nothing from a login link is kept
  const key = url.origin + url.pathname;
  const pageFile = isPageFile(request, url);
  const fresh = () => fetch(request, { cache: pageFile ? 'default' : 'no-cache' }).then(async response => {
    if (response.ok && !response.redirected) await (await caches.open(CACHE)).put(key, response.clone());
    return response;
  });
  const saved = caches.open(CACHE).then(cache => cache.match(key)); // asked first, so this visit gets the older copy
  const network = fresh();
  event.waitUntil(network.catch(() => {})); // finishes saving even after the page has its answer
  event.respondWith(saved.then(cached => {
    if (pageFile) {
      if (cached) return cached;
      return network.catch(async () => (request.mode === 'navigate' && await (await caches.open(CACHE)).match(new URL('./', location).href)) || Response.error());
    }
    if (!cached) return network.catch(() => Response.error());
    return Promise.race([
      network.catch(() => cached),
      new Promise(resolve => setTimeout(() => resolve(cached), SLOW_NETWORK_MS)),
    ]);
  }));
});
