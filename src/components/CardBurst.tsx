"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

/**
 * A brief shower of golden sparks, shown the instant a card is revealed.
 * Pure decoration: pointer-events-none, unmounts itself via AnimatePresence
 * from the parent.
 */
export default function CardBurst() {
  const sparks = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => {
        const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 46 + Math.random() * 42;
        return {
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          size: 3 + Math.random() * 4,
          delay: Math.random() * 0.08,
          gold: Math.random() > 0.35,
        };
      }),
    []
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
