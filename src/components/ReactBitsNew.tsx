"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

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
 * - SpotlightCard: What do you seek cards only, plus journal
 *   repeated questions in Personal Phase 2.
 * - PageTransition: a short fade and rise on navigation, all pages.
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

function isTouchPointer(event: React.PointerEvent): boolean {
  return event.pointerType === "touch";
}

export function SpotlightCard({
  children,
  className = "",
  spotlightColor = "rgba(212, 175, 55, 0.18)",
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
      className={`relative overflow-hidden ${className}`}
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
      className={`relative inline-block overflow-hidden ${className}`}
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
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <div className={className}>
      {children.map((child, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06, duration: 0.35, ease: "easeOut" }}
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
  const reduce = useReducedMotion();
  // Codex fresh re-review on PR 50, correct: the first fix listened
  // on the background layer, but hero copy and CTAs are siblings of
  // that layer, so moves over them never reached it. Listen on the
  // shared hero section ancestor (closest section), keeping the
  // decorative layer click-through.
  useEffect(() => {
    if (reduce) return;
    const section = ref.current?.closest("section");
    if (!section) return;
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
  if (reduce) {
    return (
      <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
        <div className="absolute left-1/4 top-1/4 h-72 w-72 rounded-full opacity-25 blur-3xl" style={{ background: "radial-gradient(circle, rgba(212,175,55,0.5) 0%, transparent 70%)" }} />
      </div>
    );
  }
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      <motion.div
        className="absolute left-1/4 top-1/4 h-72 w-72 rounded-full opacity-25 blur-3xl"
        style={{
          background: "radial-gradient(circle, rgba(212,175,55,0.55) 0%, transparent 70%)",
          x: "var(--orb-x, 0px)",
          y: "var(--orb-y, 0px)",
        }}
        animate={{ rotate: 360, scale: [1, 1.15, 1] }}
        transition={{ rotate: { duration: 40, repeat: Infinity, ease: "linear" }, scale: { duration: 12, repeat: Infinity, ease: "easeInOut" } }}
      />
      <motion.div
        className="absolute right-1/4 top-1/2 h-56 w-56 rounded-full opacity-20 blur-3xl"
        style={{
          background: "radial-gradient(circle, rgba(244,208,63,0.5) 0%, transparent 70%)",
          x: "var(--orb-x, 0px)",
          y: "var(--orb-y, 0px)",
        }}
        animate={{ rotate: -360, scale: [1, 1.1, 1] }}
        transition={{ rotate: { duration: 55, repeat: Infinity, ease: "linear" }, scale: { duration: 15, repeat: Infinity, ease: "easeInOut" } }}
      />
    </div>
  );
}

export function PageTransition({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const pathname = usePathname();
  if (reduce) return <>{children}</>;
  // Codex review on PR 43, correct: a layout component is preserved
  // across client-side navigation, so without a key this motion.div
  // does not remount and its initial animation runs only on the
  // first page load. Keying by pathname remounts it on every route
  // change, so the short fade and rise actually runs on navigation.
  // No exit animation is faked, and no React Bits page-transition
  // component exists in the free catalogue to install instead.
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
