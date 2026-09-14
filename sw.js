const CACHE='german-vocab-audiobook-quiztest-v1';
const CORE=[
  './',
  './index.html',
  './styles.css?v=20260914-quiztest1',
  './site-config.js?v=20260914-quiztest1',
  './courses.js?v=20260914-quiztest1',
  './app.js?v=20260914-quiztest1',
  './manifest.webmanifest',
  './courses/a1/data.js?v=20260914-quiztest1',
  './courses/a2/data.js?v=20260914-quiztest1',
  './courses/b1/data.js?v=20260914-quiztest1',
  './courses/technical/data.js?v=20260914-quiztest1'
];
self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));
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
