// Caches the app shell so Connect opens instantly and survives a dropped network.
// Message data is never cached — it always comes from Supabase.
const CACHE = 'connect-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  'https://esm.sh/@supabase/supabase-js@2.47.10'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll fails the whole install if one URL 404s; tolerate per-item failure
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const keep = url => url.origin === location.origin || url.hostname === 'esm.sh';

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // never intercept API, realtime, or uploaded attachments
  if (url.hostname.endsWith('supabase.co')) return;

  // The page itself is network-first, so a deploy reaches an installed app on the
  // next launch instead of being pinned to whatever was cached at install time.
  if (e.request.mode === 'navigate' || e.request.destination === 'document'){
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then(hit => hit || caches.match('./')))
    );
    return;
  }

  // Everything else (icons, the Supabase client bundle) is cache-first.
  e.respondWith(
    caches.match(e.request).then(hit =>
      hit || fetch(e.request).then(res => {
        if (res.ok && keep(url)){
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
    )
  );
});
