"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

/**
 * A brief shower of golden sparks, shown the instant a card is revealed
 * (or a purchase completes, with a bigger count/spread).
 * Pure decoration: pointer-events-none, unmounts itself via AnimatePresence
 * from the parent.
 */
export default function CardBurst({
  count = 16,
  distance = 88,
}: {
  count?: number;
  distance?: number;
}) {
  // Deterministic spark layout: a sin-hash of the index gives varied
  // angles, distances, sizes and delays without Math.random, so the
  // render is pure and server/client output matches.
  const sparks = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const h = (n: number) => {
          const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
          return x - Math.floor(x);
        };
        const angle = (i / count) * Math.PI * 2 + h(i) * 0.4;
        const dist = distance * 0.5 + h(i + 100) * distance * 0.5;
        return {
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          size: 3 + h(i + 200) * 4,
          delay: h(i + 300) * 0.08,
          gold: h(i + 400) > 0.35,
        };
      }),
    [count, distance]
  );

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
    >
      {sparks.map((s, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            width: s.size,
            height: s.size,
            background: s.gold ? "#e8c55a" : "#fff7dd",
            boxShadow: s.gold
              ? "0 0 8px rgba(232,197,90,0.9)"
              : "0 0 6px rgba(255,247,221,0.8)",
          }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: s.x, y: s.y, opacity: 0, scale: 0.4 }}
          transition={{ duration: 0.85, delay: s.delay, ease: "easeOut" }}
        />
      ))}
      {/* Soft expanding ring */}
      <motion.span
        className="absolute rounded-full border border-gold/70"
        style={{ width: 24, height: 24 }}
        initial={{ scale: 0.4, opacity: 0.9 }}
        animate={{ scale: 4.2, opacity: 0 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
    </div>
  );
}
