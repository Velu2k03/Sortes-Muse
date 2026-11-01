"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import type { TarotCard } from "@/lib/types";

// Original Sortes component, built from the fan pattern only:
// cards fanned like a hand, outer cards tilted and dropped into a
// curve, the hovered card straightening, lifting, and opening space
// around itself. No code, asset, or style was copied from any
// component library. Entrance is framer-motion, so the app-wide
// MotionConfig reducedMotion="user" setting and the global
// reduced-motion CSS rule already calm it for users who prefer that.
// Hover lift is on the inner element, so it never fights the outer
// element's fan rotation and curve.
export default function TarotFan({
  cards,
}: {
  cards: Pick<TarotCard, "id" | "name" | "image">[];
}) {
  const middle = (cards.length - 1) / 2;
  return (
    <div className="flex justify-center" role="list" aria-label="Tarot cards">
      {cards.map((c, i) => {
        const offset = i - middle;
        const tilt = offset * 7;
        const drop = Math.abs(offset) * 6;
        return (
          <motion.div
            key={c.id}
            role="listitem"
            initial={{ opacity: 0, y: 20, rotate: tilt }}
            whileInView={{ opacity: 1, y: drop, rotate: tilt }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08, duration: 0.5 }}
            style={{ zIndex: 10 - Math.abs(offset) }}
            className="-ml-6 first:ml-0 sm:-ml-8 sm:first:ml-0"
          >
            <Link
              href="/deck"
              aria-label={`See ${c.name} in the deck`}
              className="block rounded-lg transition-transform duration-300 hover:-translate-y-3 hover:scale-105 hover:rotate-0 focus-visible:-translate-y-3 focus-visible:scale-105 focus-visible:rotate-0"
            >
              <div className="relative h-28 w-[4.5rem] overflow-hidden rounded-lg border border-gold/30 shadow-[0_8px_24px_rgba(0,0,0,0.45)] sm:h-36 sm:w-24">
                <Image
                  src={c.image}
                  alt={c.name}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              </div>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}
