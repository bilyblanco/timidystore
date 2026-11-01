
"use strict";

(function () {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", async () => {
    try {
      const registration =
        await navigator.serviceWorker.register(
          "/timidystore/sw.js",
          { scope: "/timidystore/" }
        );

      console.info(
        "Timidy PWA service worker registered:",
        registration.scope
      );
    } catch {
      console.warn(
        "Timidy PWA service worker registration unavailable."
      );
    }
  });
})();
