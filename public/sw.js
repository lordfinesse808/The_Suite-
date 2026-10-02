// Minimal service worker: makes the dashboard installable and keeps an offline shell.
const CACHE = "ile-v1";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/icon.svg", "/manifest.webmanifest"])));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).pathname.startsWith("/api/")) return;
  e.respondWith(fetch(req).catch(() => caches.match(req).then((r) => r || new Response("You are offline. ilé will reconnect when you are back online.", { headers: { "content-type": "text/plain" } }))));
});
