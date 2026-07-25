// Caches the app shell so Connect opens instantly and survives a dropped network.
// Message data is never cached — it always comes from Supabase.
const CACHE = 'connect-v3';
const MEDIA = 'connect-media-v1';   // uploaded attachments, kept separate so the
const MEDIA_MAX = 150;              // shell can be versioned without dropping them
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
  const keep = [CACHE, MEDIA];
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Attachments are immutable — the path carries a UUID — so once fetched they never
// need revalidating. Serving repeat views from disk is the difference between
// scrolling history costing egress every time and costing it once.
async function cachedMedia(request){
  const cache = await caches.open(MEDIA);
  const hit = await cache.match(request);
  if (hit) return hit;

  const res = await fetch(request);
  // opaque responses (status 0) come from no-cors loads and are still worth
  // keeping — they replay fine even though their contents can't be read
  if (res.ok || res.type === 'opaque'){
    cache.put(request, res.clone());
    // trim oldest-first; keys() returns insertion order
    cache.keys().then(keys => {
      if (keys.length > MEDIA_MAX)
        keys.slice(0, keys.length - MEDIA_MAX).forEach(k => cache.delete(k));
    });
  }
  return res;
}

const keep = url => url.origin === location.origin || url.hostname === 'esm.sh';

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  if (url.hostname.endsWith('supabase.co')){
    // Cache uploaded files; leave REST and realtime traffic alone. Range requests
    // (how <video> seeks) are passed through — a cached 206 would be a partial file.
    if (url.pathname.startsWith('/storage/v1/object/public/') && !e.request.headers.has('range'))
      e.respondWith(cachedMedia(e.request));
    return;
  }

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
