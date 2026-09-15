const CACHE='german-vocab-audiobook-v1.0.2-langfix2';
const CORE=[
  './',
  './index.html',
  './styles.css?v=20260914-langfix2',
  './site-config.js?v=20260914-langfix2',
  './courses.js?v=20260914-langfix2',
  './app.js?v=20260914-langfix2',
  './manifest.webmanifest',
  './logo-pwa-192-v4.png',
  './logo-pwa-512-v4.png',
  './courses/a1/data.js?v=20260914-langfix2',
  './courses/a2/data.js?v=20260914-langfix2',
  './courses/b1/data.js?v=20260914-langfix2',
  './courses/technical/data.js?v=20260914-langfix2'
];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));
});
self.addEventListener('message',e=>{
  if(e.data&&e.data.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([
  caches.keys().then(keys=>Promise.all(
    keys.filter(k=>k!==CACHE&&k.startsWith('german-vocab-audiobook-')).map(k=>caches.delete(k))
  )),
  self.clients.claim()
])));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(u.origin!==self.location.origin)return;
  if(/\.(mp3|m4a|wav|ogg)(\?|$)/i.test(u.pathname))return;
  e.respondWith(
    fetch(e.request).then(r=>{
      const copy=r.clone();
      caches.open(CACHE).then(c=>c.put(e.request,copy));
      return r;
    }).catch(()=>caches.match(e.request))
  );
});
