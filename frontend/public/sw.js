// Cleanup stale service worker from previous deployments.
// This SW never caches anything — it just unregisters itself on activation.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", () => {
  // Claim all clients so we can reload them after unregistering
  self.clients.claim();
  self.registration
    .unregister()
    .then(() => self.clients.matchAll({ type: "window" }))
    .then((clients) => {
      for (const client of clients) {
        client.navigate(client.url);
      }
    });
});
