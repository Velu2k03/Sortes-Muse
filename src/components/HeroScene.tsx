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
  // Lazy initializer reads the media query once; the effect below
  // only subscribes to changes (setState in a callback, not in the
  // effect body, per react-hooks/set-state-in-effect).
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  if (reducedMotion) return <HeroFanStatic />;
  return <Hero3D />;
}
