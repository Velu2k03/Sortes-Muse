"use client";
import Icon from "@/components/Icon";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { motion } from "framer-motion";
import { SPREADS, CARD_BACK } from "@/lib/tarot";
import { getCard } from "@/lib/cards";
import CheckoutModal from "@/components/CheckoutModal";
import { GlareHover } from "@/components/ReactBitsNew";
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
  // Deep UX Batch C: question picker. A newcomer should not have to
  // self-diagnose a spread name; they pick what they are asking
  // about, and the matching card is highlighted and scrolled to.
  const [pickedSlug, setPickedSlug] = useState<string | null>(null);
  const pickSpread = (slug: string) => {
    setPickedSlug(slug);
    document.getElementById(`spread-${slug}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
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
            ? "Each reading uses 1 Oracle, any spread. Oracles never expire."
            : "Your first Quick Insight reading is free, no card required. Other spreads need 1 Oracle, which is why they show Get Oracles to begin until you have one. After your free Quick Insight, every reading, any spread, is 1 Oracle."}
        </p>
        {/* Personal Phase 4, Decision 16: reflection disclaimer on
            the spread pages themselves, not only on FAQ. */}
        <p className="mx-auto mt-3 max-w-xl text-xs italic text-mist">
          Readings are for reflection and perspective only, never
          guaranteed predictions, and never a replacement for
          professional advice.
        </p>
      </div>

      {/* Personal Phase 3: first-time guidance. The grid alone gives
          six equal choices; a new user needs one obvious start. This
          banner is a link only, it changes no gate, cost, or spread. */}
      {!usedFree && (
        <div className="mx-auto mt-8 max-w-2xl rounded-3xl border border-gold/25 bg-panel/60 p-6 text-center">
          <p className="font-display text-2xl text-goldbright">
            Start here, it is free
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-cream/75">
            Your first Quick Insight reading costs no Oracle and asks one
            question. After that, every reading, any spread, is 1 Oracle.
          </p>
          <GlareHover className="mt-4 rounded-xl">
            <Link
              href="/spreads/quick-insight"
              className="btn-gold inline-block rounded-xl px-8 py-3 font-bold"
            >
              Begin my free reading
            </Link>
          </GlareHover>
        </div>
      )}

      <div className="mx-auto mt-8 flex max-w-2xl flex-wrap justify-center gap-2" role="group" aria-label="What are you asking about?">
        {[
          { label: "A decision", slug: "past-present-future" },
          { label: "A relationship", slug: "love-insight" },
          { label: "My career", slug: "career-path" },
          { label: "My week", slug: "weekly-outlook" },
          { label: "A deep dive", slug: "celtic-cross" },
          { label: "Free first reading", slug: "quick-insight" },
        ].map((o) => (
          <button
            key={o.slug}
            type="button"
            onClick={() => pickSpread(o.slug)}
            aria-pressed={pickedSlug === o.slug}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${pickedSlug === o.slug ? "bg-gold text-ink" : "border border-gold/30 text-cream/90 hover:bg-gold/10"}`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {SPREADS.map((s, i) => {
          const locked = !canBegin(s.slug);
          return (
          <motion.article
            id={`spread-${s.slug}`}
            key={s.slug}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.4 }}
            className={`relative flex flex-col overflow-hidden rounded-3xl border bg-panel/70 ${pickedSlug === s.slug ? "border-gold shadow-[0_0_0_2px_rgba(212,175,55,0.6)]" : "border-gold/25"}`}
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
                    <span className="inline-flex items-center gap-2"><Icon name="lock" size={16} />Locked preview</span>
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-1 flex-col p-6">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-3xl text-cream">{s.name}</h2>
                <p className="shrink-0 whitespace-nowrap font-display text-xl text-goldbright">
                  {s.slug === "quick-insight" && !usedFree ? "Free" : (<><span className="font-body">1</span> Oracle</>)}
                </p>
              </div>
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-mist">
                {s.cards} {s.cards === 1 ? "card" : "cards"} · personalized AI interpretation
              </p>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-cream/75">
                {s.description}
              </p>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-goldbright">Positions in this spread ({s.positions.length})</summary>
                <ul className="mt-2 space-y-1">
                  {s.positions.map((p) => (
                    <li key={p.key} className="text-xs text-cream/80">
                      <span className="text-goldbright">{p.label}</span>
                      {": "}
                      {p.hint}
                    </li>
                  ))}
                </ul>
              </details>
              {locked ? (
                <>
                  <button
                    type="button"
                    onClick={() => setCheckoutOpen(true)}
                    className="btn-gold mt-5 rounded-xl px-4 py-3 text-center font-bold"
                  >
                    Get Oracles to begin
                  </button>
                  {/* Phase 5: locked cards used to offer only the
                      checkout button, so a spread detail page was
                      not discoverable from the index. This link
                      goes to the spread detail, which still gates
                      the reading itself, so nothing about the gate,
                      cost, or spread data changes. */}
                  <Link
                    href={`/spreads/${s.slug}`}
                    className="mt-3 block text-center text-sm font-semibold text-goldbright underline underline-offset-4"
                  >
                    View spread detail
                  </Link>
                </>
              ) : (
                <Link
                  href={`/spreads/${s.slug}`}
                  className="btn-gold mt-5 block rounded-xl px-4 py-3 text-center font-bold"
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
        <p className="font-display text-2xl text-goldbright">How Oracles work</p>
        <p className="mt-2 text-sm leading-relaxed text-cream/75">
          You pay only for Oracle packs, never per reading, never twice.
          One Oracle pays for one full reading of any spread, with an AI
          interpretation for your question. Your daily card is always free
          and never uses an Oracle. Oracles never expire. No subscriptions.
          The one free reading is Quick Insight only.
        </p>
        <button
          type="button"
          onClick={() => setCheckoutOpen(true)}
          className="btn-ghost mt-4 rounded-xl px-6 py-2.5 text-sm font-semibold"
        >
          View Oracle packs
        </button>
      </div>

      <CheckoutModal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} />
    </div>
  );
}
