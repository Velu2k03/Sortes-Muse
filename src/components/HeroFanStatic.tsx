"use client";

import Image from "next/image";

/**
 * Phase 2 static fallback for the 3D hero: the same fan of three
 * real tarot cards before a gold moon, as plain images. Used when
 * the visitor prefers reduced motion, and as the loading fallback
 * while the 3D scene chunk loads, so the hero never shows an empty
 * box.
 */

const FAN_CARDS = [
  { src: "/cards/major-00-fool.jpg", name: "The Fool", tilt: -14 },
  { src: "/cards/major-01-magician.jpg", name: "The Magician", tilt: 0 },
  { src: "/cards/major-02-high-priestess.jpg", name: "The High Priestess", tilt: 14 },
] as const;

export default function HeroFanStatic() {
  return (
    <div
      className="relative mx-auto flex h-[320px] w-full max-w-3xl items-center justify-center sm:h-[420px]"
      aria-label="Three tarot cards fanned out before a gold moon"
    >
      {/* Gold moon behind the fan, with a soft glow. */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/20 blur-2xl sm:h-72 sm:w-72"
      />
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/90 sm:h-56 sm:w-56"
      />
      <ul role="list" className="relative flex items-center" aria-label="Tarot cards">
        {FAN_CARDS.map((c) => (
          <li
            key={c.src}
            style={{ transform: `rotate(${c.tilt}deg)` }}
            className="-ml-4 first:ml-0 sm:-ml-6 sm:first:ml-0"
          >
            <div className="relative h-44 w-[7rem] overflow-hidden rounded-lg border-2 border-gold shadow-card-lg sm:h-60 sm:w-40">
              <Image
                src={c.src}
                alt={c.name}
                fill
                sizes="160px"
                className="object-cover"
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
