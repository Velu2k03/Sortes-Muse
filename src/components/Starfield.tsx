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
 * hidden, and renders a single static frame when the user prefers
 * reduced motion.
 *
 * Phase 4C (4.8b): cost is scaled down on small screens (under 640px
 * the star count drops to ~45%), and reduced motion now draws one
 * static frame instead of nothing, so the celestial look survives
 * with zero ongoing cost. Canvas resolution stays at CSS pixels (no
 * devicePixelRatio upscale): cheap on retina, slightly soft,
 * unchanged.
 *
 * AF-032: the large four-point sparkles are gone from this site-wide
 * layer. The canvas already sat at -z-10, below the content, but a
 * bright 18px cross directly behind a letter showed through the
 * letter's counter and read as a "+" splitting the glyph ("1 O+racle",
 * "conn+ection"). Tiny drifting stars (r <= 2) cannot do that, so
 * they stay; the crosses do not come back.
 */
export default function Starfield({ density = 90 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Phase 4C (4.8b): reduced motion gets one static frame, not an
    // empty sky and not a running loop.
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let stars: Star[] = [];
    let w = 0;
    let h = 0;

    const seed = () => {
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
      // Phase 4C (4.8b): fewer stars on small screens, where the
      // field is a narrow strip and the device is likeliest to be
      // low-powered.
      const small = w < 640;
      const count = small ? Math.max(24, Math.round(density * 0.45)) : density;
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.6 + 0.4,
        speed: Math.random() * 0.12 + 0.03,
        drift: Math.random() * 0.2 - 0.1,
        alpha: Math.random() * 0.55 + 0.15,
        twinkle: Math.random() * Math.PI * 2,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const a = s.alpha * (0.6 + 0.4 * Math.sin(s.twinkle));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(232, 197, 90, ${a.toFixed(3)})`;
        ctx.fill();
      }
    };

    const tick = () => {
      for (const s of stars) {
        s.y -= s.speed;
        s.x += s.drift;
        s.twinkle += 0.02;
        if (s.y < -4) {
          s.y = h + 4;
          s.x = Math.random() * w;
        }
      }
      draw();
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
    if (reducedMotion) {
      // One static frame; re-seed and redraw on resize so the field
      // still covers the viewport, with no running loop.
      draw();
      const onResize = () => {
        seed();
        draw();
      };
      window.addEventListener("resize", onResize);
      return () => {
        window.removeEventListener("resize", onResize);
      };
    }
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
