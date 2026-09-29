"use client";

/**
 * Privacy-friendly analytics events (Plausible). No-op when the Plausible
 * script is not configured, so nothing breaks in local dev.
 */
export function trackEvent(name: string, props?: Record<string, string | number>) {
  if (typeof window === "undefined") return;
  const plausible = (window as unknown as {
    plausible?: (name: string, opts?: { props?: Record<string, string | number> }) => void;
  }).plausible;
  if (typeof plausible === "function") {
    plausible(name, props ? { props } : undefined);
  } else if (process.env.NODE_ENV !== "production") {
    // Observable in dev so event wiring can be verified without Plausible.
    console.debug(`[analytics] ${name}`, props ?? {});
  }
}

export function trackReadingStarted(spread: string) {
  trackEvent("reading_started", { spread });
}

export function trackPurchaseCompleted(pack: string, amount: number) {
  trackEvent("purchase_completed", { pack, amount });
}

export function trackDailyCardDrawn() {
  trackEvent("daily_card_drawn");
}

export function trackReadingCompleted(spread: string, paid: boolean) {
  trackEvent("reading_completed", { spread, paid: paid ? "yes" : "no" });
}
