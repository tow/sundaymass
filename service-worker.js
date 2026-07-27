const CACHE_NAME = "st-james-mass-planner-v45";
const APP_SHELL = [
  "./",
  "./index.html",
  "./about.html",
  "./repertoire.html",
  "./manifest.webmanifest",
  "./supabase-config.js",
  "./src/services/plan-store.js",
  "./src/services/repertoire-store.js",
  "./data/generated/readings_text.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    const pathname = new URL(event.request.url).pathname;
    const cacheTarget = pathname.endsWith("/about.html")
      ? "./about.html"
      : pathname.endsWith("/repertoire.html")
        ? "./repertoire.html"
        : "./index.html";
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(cacheTarget, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match(cacheTarget)))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      const updated = fetch(event.request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || updated;
    })
  );
});
