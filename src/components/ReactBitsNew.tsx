"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
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
 * - GradientText: hero Sortes word only, gold on the dark hero.
 * - Magnet: hero primary button only, pointer only.
 * - SpotlightCard: What do you seek cards only.
 * - PageTransition: a short fade and rise on navigation, all pages.
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

export function GradientText({
  children,
  colors = ["#d4af37", "#f4d03f", "#b8962e", "#f4d03f", "#d4af37"],
  animationSpeed = 6,
  className = "",
}: {
  children: ReactNode;
  colors?: string[];
  animationSpeed?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <span className={className} style={{ color: colors[1] }}>{children}</span>;
  }
  return (
    <motion.span
      className={className}
      style={{
        backgroundImage: `linear-gradient(110deg, ${colors.join(", ")})`,
        backgroundSize: "220% 100%",
        backgroundClip: "text",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        color: "transparent",
      } as CSSProperties}
      animate={{ backgroundPosition: ["0% 0", "220% 0"] }}
      transition={{ duration: animationSpeed, repeat: Infinity, ease: "easeInOut" }}
    >
      {children}
    </motion.span>
  );
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

export function Magnet({
  children,
  strength = 0.25,
  className = "",
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isTouchPointer(event) || isReducedMotion() || !ref.current) return;
    const bounds = ref.current.getBoundingClientRect();
    const x = (event.clientX - (bounds.left + bounds.width / 2)) * strength;
    const y = (event.clientY - (bounds.top + bounds.height / 2)) * strength;
    ref.current.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  };
  const onLeave = () => {
    if (ref.current) ref.current.style.transform = "translate(0px, 0px)";
  };
  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`inline-block transition-transform duration-200 ease-out ${className}`}
    >
      {children}
    </div>
  );
}

export function PageTransition({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  // Short fade and rise on mount. App Router pages mount fresh on
  // navigation, so this is the page transition: no exit animation
  // is faked, and no React Bits page-transition component exists
  // in the free catalogue to install instead.
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
