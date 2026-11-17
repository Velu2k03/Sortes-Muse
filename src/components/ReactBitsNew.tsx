"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import clsx from "clsx";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";

/**
 * Phase 4, React Bits expansion, no new dependencies.
 *
 * These are the React Bits patterns, implemented in Sortes with the
 * React Bits prop names, instead of installing them through shadcn:
 * shadcn installs previously downgraded Motion to 12.43.0 twice,
 * and Motion is locked at 14.9.0. No new package is added here.
 * Motion-based parts import motion/react, which is already present.
 *
 * Purposeful use only, one interaction type per area:
 * - SpotlightCard: What's on your mind cards only, plus journal
 *   repeated questions in Personal Phase 2.
 * - PageTransition: a short rise on navigation (never hidden), all pages.
 * - GlareHover: spreads guided start button only, pointer only.
 * - AnimatedList: guides index list only, one stagger on mount.
 * - Orb: home hero background only, gold orbs in app colours, slow
 *   rotation, hover intensity from pointer position, static under
 *   reduced motion. Local implementation, no ogl dependency.
 *
 * Phase 4C (4.6/4.7): GradientText and Magnet were deleted here.
 * Both were homepage-only (hero word sweep, hero button pull) and
 * the homepage no longer uses them under restrained motion.
 *
 * Every component is static under prefers-reduced-motion and does
 * nothing special on touch, where there is no pointer to follow.
 * TiltedCard, LightRays, CircularGallery, and ScrollStack are NOT
 * installed here: TiltedCard needs a tap fallback sample, LightRays
 * needs the ogl WebGL dependency, CircularGallery needs ogl, and
 * ScrollStack needs lenis. Those need a separate sample approval.
 */

function isReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Shared by AnimatedList and Orb. All-pages follow-up to fix 10
// (PR #147 Codex P2s): MotionConfig reducedMotion="user" disables
// transform/layout animations but preserves opacity animations, so
// the guides list still faded in with staggered delays for
// reduced-motion users, and the Orb's one-time isReducedMotion()
// check never reacted to a mid-session change. This hook fixes
// both: it subscribes to the media query, the same pattern
// useChartPrefs and DeckClient use.
// Hydration-safe by construction: the state starts false, which
// matches the server render (the server cannot see
// prefers-reduced-motion), so the first client render hydrates
// identically and no React #418 fires; the effect then syncs the
// real preference after mount. Never branch the rendered tree on
// this value, only animation props and effect behaviour.
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

function isTouchPointer(event: React.PointerEvent): boolean {
  return event.pointerType === "touch";
}

export function SpotlightCard({
  children,
  className = "",
  spotlightColor = "color-mix(in srgb, var(--color-gold) 18%, transparent)",
}: {
  children: ReactNode;
  className?: string;
  spotlightColor?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isTouchPointer(event) || isReducedMotion() || !ref.current) return;
    const bounds = ref.current.getBoundingClientRect();
    ref.current.style.setProperty("--spot-x", `${event.clientX - bounds.left}px`);
    ref.current.style.setProperty("--spot-y", `${event.clientY - bounds.top}px`);
    ref.current.style.setProperty("--spot-opacity", "1");
  };
  const onLeave = () => {
    if (ref.current) ref.current.style.setProperty("--spot-opacity", "0");
  };
  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={clsx("relative overflow-hidden", className)}
      style={
        {
          "--spot-x": "50%",
          "--spot-y": "50%",
          "--spot-opacity": "0",
        } as CSSProperties
      }
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(320px circle at var(--spot-x) var(--spot-y), ${spotlightColor}, transparent 70%)`,
          opacity: "var(--spot-opacity)",
          transition: "opacity 240ms ease-out",
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

export function GlareHover({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isTouchPointer(event) || isReducedMotion() || !ref.current) return;
    const bounds = ref.current.getBoundingClientRect();
    ref.current.style.setProperty("--glare-x", `${((event.clientX - bounds.left) / bounds.width) * 100}%`);
    ref.current.style.setProperty("--glare-y", `${((event.clientY - bounds.top) / bounds.height) * 100}%`);
    ref.current.style.setProperty("--glare-opacity", "1");
  };
  const onLeave = () => {
    if (ref.current) ref.current.style.setProperty("--glare-opacity", "0");
  };
  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={clsx("relative inline-block overflow-hidden", className)}
      style={
        {
          "--glare-x": "50%",
          "--glare-y": "50%",
          "--glare-opacity": "0",
        } as CSSProperties
      }
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background: "radial-gradient(180px circle at var(--glare-x) var(--glare-y), rgba(255, 255, 255, 0.35), transparent 70%)",
          opacity: "var(--glare-opacity)",
          transition: "opacity 200ms ease-out",
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

export function AnimatedList({
  children,
  className = "",
}: {
  children: ReactNode[];
  className?: string;
}) {
  // All-pages fix 10: no useReducedMotion branch here. The old
  // `if (reduce) return <div>` rendered a different tree on the
  // client than the server for reduced-motion users (the server
  // cannot see prefers-reduced-motion), which threw a React #418
  // hydration error on the guides page. MotionConfig
  // reducedMotion="user" already makes the stagger instant for
  // those users, so the branch was redundant.
  // All-pages follow-up to fix 10 (PR #147 Codex P2): "instant"
  // only covered transform/layout. MotionConfig preserves opacity
  // animations, so reduced-motion users still got the 0.35s fade
  // with staggered delays. The list is now fully static for them:
  // initial={false} skips the entrance and duration/delay 0 kills
  // the tween, while normal-motion users keep the fade. The hook
  // starts false (server-identical first render, no #418) and
  // syncs after mount, so the tree never branches, only the
  // animation props change.
  const reduce = usePrefersReducedMotion();
  return (
    <div className={className}>
      {children.map((child, i) => (
        <motion.div
          key={i}
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0, delay: 0 } : { delay: i * 0.06, duration: 0.35, ease: "easeOut" }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}

export function Orb({
  className = "",
}: {
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // All-pages follow-up to fix 10 (PR #147 Codex P2): the old
  // effect checked isReducedMotion() once at mount, so a visitor
  // who enabled reduced motion mid-session kept the pointer-follow
  // moving the orbs. The effect now depends on the live
  // usePrefersReducedMotion subscription: enabling reduced motion
  // detaches the listener and parks both orbs at their rest
  // position, disabling it re-attaches the listener. The rendered
  // tree never branches on the preference, so no React #418.
  const reduce = usePrefersReducedMotion();
  // Codex fresh re-review on PR 50, correct: the first fix listened
  // on the background layer, but hero copy and CTAs are siblings of
  // that layer, so moves over them never reached it. Listen on the
  // shared hero section ancestor (closest section), keeping the
  // decorative layer click-through.
  useEffect(() => {
    const section = ref.current?.closest("section");
    if (!section) return;
    if (reduce) {
      ref.current?.style.setProperty("--orb-x", "0px");
      ref.current?.style.setProperty("--orb-y", "0px");
      return;
    }
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch" || !ref.current) return;
      const rect = section.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      ref.current.style.setProperty("--orb-x", `${x * 30}px`);
      ref.current.style.setProperty("--orb-y", `${y * 30}px`);
    };
    section.addEventListener("pointermove", onMove);
    return () => section.removeEventListener("pointermove", onMove);
  }, [reduce]);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={clsx("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <motion.div
        className="absolute left-1/4 top-1/4 h-72 w-72 rounded-full opacity-25 blur-3xl"
        style={{
          background: "radial-gradient(circle, color-mix(in srgb, var(--color-gold) 55%, transparent) 0%, transparent 70%)",
          x: "var(--orb-x, 0px)",
          y: "var(--orb-y, 0px)",
        }}
        animate={{ rotate: 360, scale: [1, 1.15, 1] }}
        transition={{ rotate: { duration: 40, repeat: Infinity, ease: "linear" }, scale: { duration: 12, repeat: Infinity, ease: "easeInOut" } }}
      />
      {/* Phase F (P2-1): second orb is static; one slow loop plus the starfield is the ambient motion. */}
      <div
        className="absolute right-1/4 top-1/2 h-56 w-56 rounded-full opacity-20 blur-3xl"
        style={{
          background: "radial-gradient(circle, rgba(244,208,63,0.5) 0%, transparent 70%)",
          transform: "translate(var(--orb-x, 0px), var(--orb-y, 0px))",
        }}
      />
    </div>
  );
}

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // All-pages fix 10: no useReducedMotion branch here. The old
  // `if (reduce) return <>{children}</>` rendered a different tree
  // on the client than the server for reduced-motion users (the
  // server cannot see prefers-reduced-motion), which threw a React
  // #418 hydration error on EVERY page, because this wraps all of
  // them in layout.tsx. MotionConfig reducedMotion="user" already
  // makes the rise instant for those users, so the branch was
  // redundant. The wrapper div stays for them too; it carries no
  // styling of its own, so layout is unchanged.
  // Codex review on PR 43, correct: a layout component is preserved
  // across client-side navigation, so without a key this motion.div
  // does not remount and its initial animation runs only on the
  // first page load. Keying by pathname remounts it on every route
  // change, so the short fade and rise actually runs on navigation.
  // No exit animation is faked, and no React Bits page-transition
  // component exists in the free catalogue to install instead.
  // F5: no opacity:0 start. The server HTML carries the initial style, so
  // an opacity-0 start painted every page blank until hydration finished.
  // Content is always visible; only a short rise runs on top.
  return (
    <motion.div
      key={pathname}
      initial={{ y: 10 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
