"use client";

import { useReducedMotion } from "framer-motion";
import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** False in server HTML and during hydration, true once JS has run. */
export function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/**
 * AF-033: scroll-reveals may only hide content once JS is running and the
 * visitor has not asked for reduced motion. Server HTML stays visible.
 * Apply as `initial={hide ? {...hidden} : false}` with
 * `key={hide ? "reveal" : "static"}` so the hidden state takes effect
 * after mount (framer-motion reads `initial` only on first mount).
 */
export function useCanHide(): boolean {
  const mounted = useMounted();
  const reduce = useReducedMotion();
  return mounted && !reduce;
}
