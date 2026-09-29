"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production. It precaches the 78 card
 * images + card back, so readings keep working offline after the first visit.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      typeof window !== "undefined" &&
      "serviceWorker" in navigator
    ) {
      const onLoad = () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {
          /* offline support is best-effort */
        });
      };
      if (document.readyState === "complete") onLoad();
      else window.addEventListener("load", onLoad);
      return () => window.removeEventListener("load", onLoad);
    }
  }, []);
  return null;
}
