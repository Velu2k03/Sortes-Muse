"use client";

import { useEffect, useState } from "react";
import { motion, useScroll, useSpring } from "motion/react";

// Reduced-motion handling, same pattern as
// usePrefersReducedMotion in ReactBitsNew.tsx (PR #154):
// Motion's own useReducedMotion is frozen at first render
// in this Motion version, so it cannot flip the bar off
// after mount. This hook starts false, which matches the
// server render (the server cannot see
// prefers-reduced-motion), then syncs the real preference
// in an effect and subscribes to mid-session changes.
// Unmounting after mount is a client-side state update, so
// no hydration mismatch fires. The CSS rule in globals.css
// still hides the bar at first paint (PR #154 pattern),
// before this effect runs.

// Scroll-progress bar in quiet gold (design-library audits
// S-35/S-36b/S-37b/S-38b, 2026-11-18; Velu approved 2026-11-18):
// the gap was that long guide and methodology pages have
// scroll-mt anchors but no reading-position indicator. The
// chosen implementation is the Magic UI scroll-progress
// pattern, hand-built in Sortes' own code, NOT the library:
// a 1px fixed bar, bar only, no expanding menu, no squircle,
// no beam, no plane, no numbers, no percentage text, and
// recolored from Magic UI's violet-pink-peach gradient to
// quiet solid gold (var(--color-gold)). Nothing from Magic
// UI, RareUI, Aceternity, or 21st.dev is installed or copied.
//
// Scope is site-wide, in the root layout, not per-page:
// one place, one behaviour, no per-page wiring to drift.
// The bar is a 2px hairline at the very top edge of the
// viewport, above the sticky Header (z-50 vs Header z-40),
// so it never covers content, the hero H1, nav links, or
// the 3D fan. On short pages scrollYProgress stays 0, so
// the bar is invisible (scaleX 0); the /daily ritual and
// intake flow are short, so it does not fight them either.
// A solid gold line, no gradient, no animation of its own:
// the only motion is scaleX following the page scroll,
// smoothed by a spring.
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

export default function ScrollProgressBar() {
  const reduce = usePrefersReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });

  if (reduce) return null;

  return (
    <motion.div
      className="scroll-progress-bar fixed left-0 right-0 top-0 z-50 h-0.5 origin-left bg-gold"
      style={{ scaleX }}
      aria-hidden="true"
    />
  );
}
