"use client";

import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  r: number;
  speed: number;
  drift: number;
  alpha: number;
  twinkle: number;
}

/**
 * Ambient drifting starfield. GPU-cheap canvas 2D, pauses when the tab is
 * hidden, and renders nothing when the user prefers reduced motion.
 */
export default function Starfield({ density = 90 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Batch 9 magic: the old field was only tiny drifting dots, so on
  // a busy page it read as dust, not magic. Twelve larger four-point
  // sparkles are added in the same canvas, same gold, same cheap
  // 2D loop, twinkling in and out. No new library, no emoji, no
  // purple gradient, and still nothing when reduced motion is on.

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let stars: Star[] = [];
    let sparkles: { x: number; y: number; r: number; twinkle: number }[] = [];
    let w = 0;
    let h = 0;

    const seed = () => {
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
      stars = Array.from({ length: density }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.6 + 0.4,
        speed: Math.random() * 0.12 + 0.03,
        drift: Math.random() * 0.2 - 0.1,
        alpha: Math.random() * 0.55 + 0.15,
        twinkle: Math.random() * Math.PI * 2,
      }));
      sparkles = Array.from({ length: 12 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 5 + 4,
        twinkle: Math.random() * Math.PI * 2,
      }));
    };

    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        s.y -= s.speed;
        s.x += s.drift;
        s.twinkle += 0.02;
        if (s.y < -4) {
          s.y = h + 4;
          s.x = Math.random() * w;
        }
        const a = s.alpha * (0.6 + 0.4 * Math.sin(s.twinkle));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(232, 197, 90, ${a.toFixed(3)})`;
        ctx.fill();
      }
      for (const sp of sparkles) {
        sp.twinkle += 0.015;
        const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(sp.twinkle));
        ctx.strokeStyle = `rgba(232, 197, 90, ${a.toFixed(3)})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(sp.x - sp.r, sp.y);
        ctx.lineTo(sp.x + sp.r, sp.y);
        ctx.moveTo(sp.x, sp.y - sp.r);
        ctx.lineTo(sp.x, sp.y + sp.r);
        ctx.stroke();
      }
      raf = requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        raf = requestAnimationFrame(tick);
      }
    };

    seed();
    raf = requestAnimationFrame(tick);
    window.addEventListener("resize", seed);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", seed);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [density]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
}
