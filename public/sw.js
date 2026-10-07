/* Vaktija — keeps a copy of the board so the TV can start and reload without internet.
   The board page, shared.js and the Google Fonts stylesheet are fetched fresh when the network
   answers, and taken from the copy when it doesn't. Font files never change, so the copy is used
   first. Settings (/api/...) are not touched here: the board keeps its own copy of those.
   The admin page is not touched either. */
const CACHE = "vaktija-v1";
const NETWORK_WAIT_MS = 4000;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin){
    // the board is stored under "/" whatever ?raspored=... it was opened with
    if (url.pathname === "/" && req.mode === "navigate") event.respondWith(networkFirst(event, req, "/"));
    else if (url.pathname === "/shared.js") event.respondWith(networkFirst(event, req, "/shared.js"));
  } else if (url.hostname === "fonts.googleapis.com"){
    event.respondWith(networkFirst(event, req, req.url));
  } else if (url.hostname === "fonts.gstatic.com"){
    event.respondWith(cacheFirst(event, req));
  }
});

function storable(res){ return res && (res.ok || res.type === "opaque"); }

async function networkFirst(event, req, key){
  const cache = await caches.open(CACHE);
  const network = fetch(req).then(res => {
    if (storable(res)) event.waitUntil(cache.put(key, res.clone()));
    return res;
  });
  const cached = await cache.match(key);
  if (!cached) return network;
  // with a stored copy, don't let a hanging connection keep the screen waiting
  const timeout = new Promise(resolve => setTimeout(() => resolve(cached), NETWORK_WAIT_MS));
  event.waitUntil(network.catch(() => {}));
  return Promise.race([network.catch(() => cached), timeout]);
}

async function cacheFirst(event, req){
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (storable(res)) event.waitUntil(cache.put(req, res.clone()));
  return res;
}
