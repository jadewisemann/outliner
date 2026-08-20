/*
 * The shell cache, and nothing more.
 *
 * The notes are already on the device in IndexedDB — what was missing is the
 * few files needed to *open* the app without a network. So this caches this
 * origin's own GETs and serves the shell when a navigation cannot reach the
 * server. A home-screen icon that shows a blank page on a plane is the one
 * way a local-first app can still feel like it needs the internet.
 *
 * Nothing cross-origin is touched. Sync talks to GitHub or to whatever
 * endpoint the user configured, and a stale answer there would be read as the
 * remote's current state and merged — so those requests must reach the
 * network or fail honestly.
 */

const CACHE = "outliner-shell-v1";
const SHELL = new URL("./", self.location).pathname;

self.addEventListener("install", () => {
  // Take over immediately: the alternative is a first launch that installs a
  // worker which only helps on the launch after that.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // A navigation prefers the network, so a deployed update is picked up on the
  // next launch rather than whenever the cache happens to be evicted.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          store(request, response);
          return response;
        })
        .catch(async () => (await caches.match(request)) ?? (await caches.match(SHELL)) ?? Response.error())
    );
    return;
  }

  // Everything else is a build asset with a content hash in its name, so the
  // cached copy is the right copy whenever there is one.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          store(request, response);
          return response;
        })
    )
  );
});

function store(request, response) {
  // An opaque or failed response cached would be served as the real thing.
  if (!response.ok || response.type === "opaque") return;
  const copy = response.clone();
  void caches.open(CACHE).then((cache) => cache.put(request, copy));
}
