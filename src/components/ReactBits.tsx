"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import "./ReactBits.css";

// Phase 4C (4.6/4.7): DarkVeil, ShinyText, and MagicBento were deleted
// here. DarkVeil had zero usages; ShinyText and MagicBento were
// homepage-only and the homepage no longer uses them (restrained
// motion: starfield + card lift + section reveal). What remains is
// used elsewhere: ClickSpark on horoscope and in the reading flow,
// StarBorder on daily and horoscope. Their CSS lives in ReactBits.css.

interface Burst {
  id: number;
  x: number;
  y: number;
}

export function ClickSpark({
  children,
  className = "",
  disabled = false,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const spark = (event: React.MouseEvent<HTMLSpanElement>) => {
    if (disabled) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const burst = {
      id: Date.now() + Math.random(),
      x: event.detail === 0 ? bounds.width / 2 : event.clientX - bounds.left,
      y: event.detail === 0 ? bounds.height / 2 : event.clientY - bounds.top,
    };
    setBursts((current) => [...current, burst]);
    const timer = setTimeout(() => {
      setBursts((current) => current.filter(({ id }) => id !== burst.id));
      timers.current.delete(timer);
    }, 560);
    timers.current.add(timer);
  };

  return (
    <span className={`click-spark ${className}`} onClick={spark}>
      {children}
      {bursts.map((burst) => (
        <span
          key={burst.id}
          className="click-spark__burst"
          style={{ left: burst.x, top: burst.y } as CSSProperties}
          aria-hidden="true"
        >
          {Array.from({ length: 8 }, (_, index) => (
            <i
              key={index}
              style={{ "--spark-angle": `${index * 45}deg` } as CSSProperties}
            />
          ))}
        </span>
      ))}
    </span>
  );
}

export function StarBorder({
  children,
  radius = "1rem",
  className = "",
  animated = false,
}: {
  children: ReactNode;
  radius?: string;
  className?: string;
  animated?: boolean;
}) {
  return (
    <span
      className={`star-border-frame ${animated ? "star-border-frame--animated" : "star-border-frame--static"} ${className}`}
      style={{ "--star-radius": radius } as CSSProperties}
    >
      {children}
      {animated && <span className="star-border__light" aria-hidden="true" />}
    </span>
  );
}
