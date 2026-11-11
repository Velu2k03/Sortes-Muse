"use client";

import { motion, useReducedMotion } from "motion/react";
import TarotCard from "@/components/TarotCard";
import type { DrawnCard } from "@/lib/types";

/**
 * Batch 10: the animated wait screen (Motion version).
 *
 * The wait during reading generation used to be mostly text. Now the
 * drawn cards show at the top of the wait screen, dealt in from above
 * with the Batch 8 deal-in (the same values as ImpressionStep, so the
 * deal feels consistent), and the row gently floats while the reading
 * generates. Each TarotCard is revealed, so its 3D flip and the gold
 * CardBurst fire automatically when it lands (Batch 7 wiring).
 *
 * The context here is different from ImpressionStep ("what do you
 * see?"): this is "we are reading your cards", so showing the same
 * cards again is a reminder of what is being read, not a repeat.
 * Reduced motion: no deal-in, no float, the cards just appear.
 */
export default function WaitDeck({ drawnCards }: { drawnCards: DrawnCard[] }) {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <motion.div
      className="mx-auto flex max-w-2xl flex-wrap items-start justify-center gap-3 sm:gap-4"
      initial={false}
      animate={
        reduceMotion
          ? undefined
          : { y: [0, -3, 0] }
      }
      transition={
        reduceMotion
          ? undefined
          : { duration: 4, repeat: Infinity, ease: "easeInOut" }
      }
    >
      {drawnCards.map((d, i) => (
        <motion.div
          key={d.positionKey}
          initial={
            reduceMotion
              ? false
              : { opacity: 0, y: -48, scale: 1.12, rotate: ((i * 7) % 11) - 5 }
          }
          animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
          transition={{
            duration: 0.5,
            delay: reduceMotion ? 0 : i * 0.1,
            ease: "easeOut",
          }}
        >
          <TarotCard
            cardId={d.cardId}
            reversed={d.reversed}
            revealed
            disabled
            size="sm"
            label={d.position}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
