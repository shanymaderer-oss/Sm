/* מסע · offline support.
   The app itself (SHELL) is fetched fresh when online and saved, and served from the saved copy offline.
   City data is served from the cache and refreshed in the background. Map tiles of places already seen stay
   available offline (a limited number). Everything else (Wikipedia, routing, weather, AI) goes straight to the network.
   VERSION is written by tools/stamp-sw.py from a hash of the shell files; a new version refreshes the saved copy. */
const VERSION = "239792bb7e";
const SHELL_CACHE = "masa-shell-" + VERSION, DATA_CACHE = "masa-data-v1", TILE_CACHE = "masa-tiles-v1";
const SHELL = [
  "./", "index.html", "privacy.html", "accessibility.html", "terms.html", "manifest.webmanifest", "css/style.css", "css/fonts.css",
  "js/min/tt.js", "js/min/data.js", "js/min/sources.js", "js/min/cities.js", "js/min/services.js", "js/min/cost.js", "js/min/transport.js", "js/min/ai.js", "js/min/intent.js", "js/cloud-config.js", "js/min/cloud.js", "js/min/planner.js", "js/min/app.js", "js/min/journey.js",
  "vendor/maplibre-gl-5.24.0/maplibre-gl.js", "vendor/maplibre-gl-5.24.0/maplibre-gl.css",
  "fonts/ibm-plex-sans-hebrew-hebrew-400-normal.woff2", "fonts/ibm-plex-sans-hebrew-hebrew-500-normal.woff2", "fonts/ibm-plex-sans-hebrew-hebrew-600-normal.woff2",
  "fonts/fredoka-hebrew-600-normal.woff2", "fonts/fredoka-hebrew-700-normal.woff2", "icons/icon-192.png"
];
const MAX_TILES = 600, MAX_CITIES = 8;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("masa-shell-") && k !== SHELL_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trim(name, max) {
  const c = await caches.open(name), keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}
async function staleWhileRevalidate(req, name, max) {
  const c = await caches.open(name);
  const hit = await c.match(req);
  const fresh = fetch(req).then(r => {
    // only complete, readable answers are kept (never opaque or partial responses)
    if (r.ok && r.status === 200 && r.type !== "opaque") { c.put(req, r.clone()).then(() => trim(name, max)); }
    return r;
  }).catch(() => hit);
  return hit || fresh;
}

async function networkFirst(req) {
  const c = await caches.open(SHELL_CACHE);
  try {
    const r = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(() => no(new Error("slow")), 4000))]);
    if (r.ok && r.status === 200 && r.type === "basic") c.put(req, r.clone());
    return r;
  } catch {
    return (await c.match(req, { ignoreSearch: true })) || (req.mode === "navigate" ? await c.match("index.html") : Response.error());
  }
}
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.includes("/data/")) return e.respondWith(staleWhileRevalidate(req, DATA_CACHE, MAX_CITIES + 2));
    // fonts, icons and the pinned map library never change under the same name: cache first
    if (/\/(vendor|fonts|icons)\//.test(url.pathname)) return e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
    // the app itself: always the newest when online (so pages and scripts match), the saved copy when offline or very slow
    return e.respondWith(networkFirst(req));
  }
  if (url.hostname === "tiles.openfreemap.org") return e.respondWith(staleWhileRevalidate(req, TILE_CACHE, MAX_TILES));
});
