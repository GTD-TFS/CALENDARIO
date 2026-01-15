const CACHE = "cal-local-v8";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./firebase.js",
  "./auth.js",
  "./app.js",
  "./vacaciones.js",
  "./admin.js",
  "./semester.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (e)=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});

self.addEventListener("activate", (e)=>{
  e.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k === CACHE ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e)=>{
  // Solo cache-first para tus archivos; lo externo (Firebase CDN) NO se cachea
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
