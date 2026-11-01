
"use strict";

const SERVICE_WORKER_VERSION = "timidy-pwa-v1";

// Activate updates promptly.
// Do not cache private pages or API responses.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Remove any caches from earlier Timidy PWA versions
      // if we introduce caching in the future.
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter((key) => key.startsWith("timidy-pwa-"))
          .map((key) => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

// No fetch handler:
// Browser requests go directly to the network.
// Supabase authentication and business operations
// remain online-only.
