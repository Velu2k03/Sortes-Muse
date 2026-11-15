"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import HeroFanStatic from "./HeroFanStatic";

/**
 * Phase 2 hero scene picker. The 3D fan is lazy-loaded (ssr: false)
 * so the question box renders and works before the 3D chunk loads,
 * and the static fan shows while it loads. Visitors who prefer
 * reduced motion never get the 3D scene; they get the static fan.
 */

const Hero3D = dynamic(() => import("./Hero3D"), {
  ssr: false,
  loading: () => <HeroFanStatic />,
});

export default function HeroScene() {
  // Mount-then-sync (same pattern as DeckClient): the server renders
  // the dynamic loader's static fallback, and the client syncs the
  // media query after mount, so there is no hydration mismatch for
  // reduced-motion visitors (Fable review, PR #103).
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  if (reducedMotion) return <HeroFanStatic />;
  return <Hero3D />;
}
