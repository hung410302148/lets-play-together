const SHELL = "party-shell-v2";
const BASE = new URL("./", self.registration.scope).pathname;
const STATIC = [
  `${BASE}icon.svg`,
  `${BASE}icon-192.png`,
  `${BASE}icon-512.png`,
  `${BASE}manifest.webmanifest`,
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      const response = await fetch(BASE);
      if (!response.ok) throw new Error("Unable to cache application shell");
      const html = await response.clone().text();
      const assets = [
        ...new Set(
          html.match(new RegExp(`${BASE}assets/[^"\\s<>]+`, "g")) || [],
        ),
      ];
      await cache.put(BASE, response);
      await cache.addAll([...STATIC, ...assets]);
    })(),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("party-shell-") && key !== SHELL)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});
// Cache only the public application shell. Never cache API, Firestore or image responses.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin)
    return;
  if (event.request.mode === "navigate")
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put(BASE, copy));
          }
          return response;
        })
        .catch(() => caches.match(BASE)),
    );
  else if (
    url.pathname.startsWith(`${BASE}assets/`) || STATIC.includes(url.pathname)
  )
    event.respondWith(
      caches.match(event.request, { ignoreVary: true }).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches
                .open(SHELL)
                .then((cache) => cache.put(event.request, copy));
            }
            return response;
          }),
      ),
    );
});
