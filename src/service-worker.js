const CACHE_NAME = "st-james-mass-planner-@@CACHE_VERSION@@";
const APP_SHELL = @@APP_SHELL@@;
// The MASS_PLANNER_BUILD of each page this deployment serves.
const APP_BUILDS = @@APP_BUILDS@@;
const PAGE_ANSWER_TIMEOUT_MS = 3000;

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
      .then(reloadPagesThatCannotUpdate)
  );
});

// A planner or repertoire page left open keeps running the code it loaded, and a phone
// resuming the installed app does not reload it, so after a deployment it calls RPCs and
// requests files that no longer exist. The page's own code cannot be changed, but the
// browser still installs each new worker over it, so the fix has to come from here.
// Every deployment asks each open page whether it can update itself. Pages built with
// pwa-controller.js's answer compare builds and reload once nothing is being edited.
// Any page that stays silent predates that answer, or is suspended in the background,
// and is navigated to a fresh load of the same URL.
function isAppPage(url) {
  const page = new URL(url).pathname.slice(new URL(self.registration.scope).pathname.length);
  return page === "" || page === "index.html" || page === "repertoire.html";
}

function answersDeployment(client) {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const settle = answered => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(answered);
    };
    const timer = setTimeout(() => settle(false), PAGE_ANSWER_TIMEOUT_MS);
    channel.port1.onmessage = () => settle(true);
    client.postMessage({ type: "deployment", builds: APP_BUILDS }, [channel.port2]);
  });
}

async function reloadPagesThatCannotUpdate() {
  const pages = (await self.clients.matchAll({ type: "window" }))
    .filter(client => isAppPage(client.url));
  await Promise.all(pages.map(async client => {
    if (await answersDeployment(client) || typeof client.navigate !== "function") return;
    // Not awaited: the navigation's own request waits for this activation to finish.
    client.navigate(client.url).catch(() => {});
  }));
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    const pathname = new URL(event.request.url).pathname;
    const cacheTarget = pathname.endsWith("/about.html")
      ? "./about.html"
      : pathname.endsWith("/september-music.html")
        ? "./september-music.html"
        : pathname.endsWith("/repertoire.html")
          ? "./repertoire.html"
          : "./index.html";
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(cacheTarget, copy));
          }
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
