"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { motion } from "framer-motion";
import { SPREADS, CARD_BACK, getSpread } from "@/lib/tarot";
import { getCard } from "@/lib/cards";
import CheckoutModal from "@/components/CheckoutModal";
import { freeReadingUsed } from "@/lib/storage";

/**
 * Spread selection. Locked spreads show blurred card previews with an
 * honest "Unlock this reading" button (no fake urgency, no dark patterns).
 */
export default function SpreadsPage() {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const usedFree = typeof window !== "undefined" && freeReadingUsed();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-gold">Readings</p>
        <h1 className="mt-3 font-display text-5xl text-goldbright sm:text-6xl">
          Choose your spread
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-cream/75">
          {usedFree
            ? "Each reading uses 1 credit, any spread. Credits never expire."
            : "Your first full reading is free, no card required. After that, 1 credit per reading."}
        </p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {SPREADS.map((s, i) => (
          <motion.article
            key={s.slug}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.55 }}
            className="relative flex flex-col overflow-hidden rounded-3xl border border-gold/25 bg-panel/70"
          >
            {/* Card preview: blurred for locked spreads */}
            <div className="relative flex h-52 items-center justify-center gap-2 overflow-hidden bg-navydeep/60 p-6">
              {s.positions.slice(0, 5).map((pos, j) => (
                <div
                  key={pos.key}
                  className={`relative h-36 w-24 shrink-0 overflow-hidden rounded-lg border border-gold/30 ${
                    s.locked ? "blur-[6px]" : ""
                  }`}
                  style={{ transform: `rotate(${(j - 2) * 7}deg)` }}
                  aria-hidden="true"
                >
                  <Image
                    src={s.locked ? CARD_BACK : getCard(["major-17", "major-19", "major-01", "major-00", "major-21"][j % 5]).image}
                    alt=""
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                </div>
              ))}
              {s.locked && (
                <div className="absolute inset-0 flex items-center justify-center bg-ink/45">
                  <span className="rounded-full border border-gold/50 bg-ink/80 px-4 py-2 text-sm font-semibold text-goldbright">
                    ✦ Locked preview
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-1 flex-col p-6">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-3xl text-cream">{s.name}</h2>
                <p className="font-display text-xl text-goldbright">
                  ${s.price.toFixed(2)}
                </p>
              </div>
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-mist">
                {s.cards} {s.cards === 1 ? "card" : "cards"} · 1 credit
              </p>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-cream/75">
                {s.description}
              </p>
              <ul className="mt-3 space-y-1">
                {s.positions.map((p) => (
                  <li key={p.key} className="text-xs text-mist">
                    <span className="text-goldbright">{p.label}</span>
                    {" — "}
                    {p.hint}
                  </li>
                ))}
              </ul>
              {s.locked ? (
                <button
                  type="button"
                  onClick={() => setCheckoutOpen(true)}
                  className="btn-gold mt-5 rounded-xl px-4 py-3 text-center font-bold"
                >
                  Unlock this reading
                </button>
              ) : (
                <Link
                  href={`/spreads/${s.slug}`}
                  className="btn-gold mt-5 rounded-xl px-4 py-3 text-center font-bold"
                >
                  {usedFree ? "Begin reading" : "Begin free reading"}
                </Link>
              )}
            </div>
          </motion.article>
        ))}
      </div>

      <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-gold/20 bg-panel/50 p-6 text-center">
        <p className="font-display text-2xl text-goldbright">How credits work</p>
        <p className="mt-2 text-sm leading-relaxed text-cream/75">
          One credit unlocks one full reading of any spread, with a
          personalized AI interpretation. Your daily card is always free and
          never uses a credit. Credits never expire, and every price is shown
          upfront. No subscriptions, no meters, no surprises.
        </p>
        <button
          type="button"
          onClick={() => setCheckoutOpen(true)}
          className="btn-ghost mt-4 rounded-xl px-6 py-2.5 text-sm font-semibold"
        >
          View credit packs
        </button>
      </div>

      <CheckoutModal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} />
    </div>
  );
}
