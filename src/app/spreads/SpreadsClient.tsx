"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { motion } from "framer-motion";
import { SPREADS, CARD_BACK, getSpread } from "@/lib/tarot";
import { getCard } from "@/lib/cards";
import CheckoutModal from "@/components/CheckoutModal";
import { useAuth } from "@/components/AuthProvider";
import { freeReadingUsed } from "@/lib/storage";

/**
 * Spread selection.
 * There is exactly ONE payment in the whole app: buying credit packs.
 * 1 credit = 1 full reading of any spread. Spreads show a blurred "locked"
 * preview only while the seeker cannot start a reading right now (no free
 * reading left and 0 credits); the moment they have a credit, the spread
 * opens with "Begin reading" and the gate offers the personalized intake.
 */
export default function SpreadsPage() {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const { credits } = useAuth();
  const usedFree = typeof window !== "undefined" && freeReadingUsed();
  const balance = credits ?? 0;

  const canBegin = (slug: string) =>
    slug === "quick-insight" ? !usedFree || balance >= 1 : balance >= 1;

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
        {SPREADS.map((s, i) => {
          const locked = !canBegin(s.slug);
          return (
          <motion.article
            key={s.slug}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.55 }}
            className="relative flex flex-col overflow-hidden rounded-3xl border border-gold/25 bg-panel/70"
          >
            {/* Card preview: blurred while the spread cannot be started yet */}
            <div className="relative flex h-52 items-center justify-center gap-2 overflow-hidden bg-navydeep/60 p-6">
              {s.positions.slice(0, 5).map((pos, j) => (
                <div
                  key={pos.key}
                  className={`relative h-36 w-24 shrink-0 overflow-hidden rounded-lg border border-gold/30 ${
                    locked ? "blur-[6px]" : ""
                  }`}
                  style={{ transform: `rotate(${(j - 2) * 7}deg)` }}
                  aria-hidden="true"
                >
                  <Image
                    src={locked ? CARD_BACK : getCard(["major-17", "major-19", "major-01", "major-00", "major-21"][j % 5]).image}
                    alt=""
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                </div>
              ))}
              {locked && (
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
                  {s.slug === "quick-insight" && !usedFree ? "Free" : "1 credit"}
                </p>
              </div>
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-mist">
                {s.cards} {s.cards === 1 ? "card" : "cards"} · personalized AI interpretation
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
              {locked ? (
                <button
                  type="button"
                  onClick={() => setCheckoutOpen(true)}
                  className="btn-gold mt-5 rounded-xl px-4 py-3 text-center font-bold"
                >
                  Get credits to begin
                </button>
              ) : (
                <Link
                  href={`/spreads/${s.slug}`}
                  className="btn-gold mt-5 rounded-xl px-4 py-3 text-center font-bold"
                >
                  {s.slug === "quick-insight" && !usedFree ? "Begin free reading" : "Begin reading"}
                </Link>
              )}
            </div>
          </motion.article>
          );
        })}
      </div>

      <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-gold/20 bg-panel/50 p-6 text-center">
        <p className="font-display text-2xl text-goldbright">How credits work</p>
        <p className="mt-2 text-sm leading-relaxed text-cream/75">
          You only ever pay for credit packs, never per reading and never
          twice. One credit unlocks one full reading of any spread, with a
          personalized AI interpretation woven around your story. Your daily
          card is always free and never uses a credit. Credits never expire.
          No subscriptions, no meters, no surprises.
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
