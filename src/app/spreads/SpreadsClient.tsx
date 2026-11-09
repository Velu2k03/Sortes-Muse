"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { useCanHide } from "@/lib/use-mounted";
import { SPREADS } from "@/lib/tarot";
import { SPREAD_SAMPLES } from "@/lib/spread-samples";
import SpreadDiagram from "@/components/SpreadDiagram";
import CheckoutModal from "@/components/CheckoutModal";
import { GlareHover } from "@/components/ReactBitsNew";
import { useAuth } from "@/components/AuthProvider";
import { freeReadingUsed } from "@/lib/storage";
import PageHeader from "@/components/PageHeader";

/**
 * Spread selection.
 * There is exactly ONE payment in the whole app: buying Oracle packs.
 * 1 Oracle = 1 full reading of any spread. Spreads show a crisp
 * SVG diagram of their card positions whether or not the seeker can
 * start a reading right now (no free reading left and 0 Oracles);
 * the moment they have an Oracle, the spread opens with
 * "Begin reading" and the gate offers the personalized intake.
 */
export default function SpreadsPage() {
  const hide = useCanHide();
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
  // AF-013: while the balance is unknown, a balance-gated card is
  // "pending", not locked. It shows a skeleton, never Locked.
  const isPending = (slug: string) =>
    credits === null && !(slug === "quick-insight" && !usedFree);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="text-center">
        <PageHeader eyebrow="Readings" title="Choose your spread" titleClassName="sm:text-6xl" />
        <p className="mx-auto mt-4 max-w-xl text-cream/75">
          {usedFree
            ? "Each reading uses 1 Oracle, any spread. Oracles never expire."
            : "First Quick Insight free. After that, 1 Oracle per reading, any spread."}
        </p>
        {/* Personal Phase 4, Decision 16: reflection disclaimer on
            the spread pages themselves, not only on FAQ. */}
        <p className="mx-auto mt-3 max-w-xl text-xs italic text-mist">
          For reflection, not prediction.
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
            One question. No Oracle, no payment card, no account.
          </p>
          <GlareHover className="mt-4 rounded-xl">
            <Link
              href="/spreads/quick-insight"
              className="btn-gold inline-block rounded-xl px-8 py-3 font-bold"
            >
              Start my free reading
            </Link>
          </GlareHover>
        </div>
      )}

      <div className="mx-auto mt-8 grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="What are you asking about?">
        {[
          { label: "A decision", slug: "past-present-future" },
          { label: "A relationship", slug: "love-insight" },
          { label: "My career", slug: "career-path" },
          { label: "My week", slug: "weekly-outlook" },
          { label: "A deep dive", slug: "celtic-cross" },
          // Codex re-review, correct: once the free reading is
          // used, Quick Insight costs 1 Oracle, so the picker
          // must stop advertising it as free.
          { label: usedFree ? "Quick Insight" : "Free first reading", slug: "quick-insight" },
        ].map((o) => (
          <button
            key={o.slug}
            type="button"
            onClick={() => pickSpread(o.slug)}
            aria-pressed={pickedSlug === o.slug}
            className={`rounded-full px-4 py-3 text-sm font-semibold transition ${pickedSlug === o.slug ? "bg-gold text-ink" : "border border-gold/30 text-cream/90 hover:bg-gold/10"}`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {SPREADS.map((s, i) => {
          const pending = isPending(s.slug);
          const locked = !pending && !canBegin(s.slug);
          return (
          <motion.article
            id={`spread-${s.slug}`}
            key={`${s.slug}-${hide ? "reveal" : "static"}`}
            initial={hide ? { opacity: 0, y: 24 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.4 }}
            className={`relative flex flex-col overflow-hidden rounded-3xl border bg-panel/70 ${pickedSlug === s.slug ? "border-gold shadow-[0_0_0_2px_rgba(212,175,55,0.6)]" : "border-gold/25"}`}
          >
            {/* Phase 4A (4.5): crisp sacred-geometry diagram of the
                spread's card positions, gold-on-dark linework. The
                old blurred card-back preview is gone; every spread
                shows its layout, and the gate stays on the button
                below (AF-015: no Locked badge). */}
            <div className={`relative flex items-center justify-center overflow-hidden bg-navydeep/60 p-4 ${s.cards === 10 ? "h-[22rem]" : "h-36"}`}>
              <div className="h-full w-full max-w-72">
                <SpreadDiagram spread={s} />
              </div>
            </div>

            <div className="flex flex-1 flex-col p-6">
              {/* Phase 4A (4.5): the long "Past · Present · Future"
                  title used to collide with the price on one
                  no-wrap row. The row now wraps, and the title may
                  shrink, so the price drops below instead of
                  overlapping. */}
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 className="min-w-0 flex-1 break-words font-display text-3xl text-cream">{s.name}</h2>
                <p className="shrink-0 whitespace-nowrap font-display text-xl text-goldbright">
                  {s.slug === "quick-insight" && !usedFree ? "Free" : (<><span className="font-body">1</span> Oracle</>)}
                </p>
              </div>
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-mist">
                {s.cards} {s.cards === 1 ? "card" : "cards"} · personalized AI interpretation
              </p>
              {pending ? (
                <div
                  className="mt-4 h-12 animate-pulse rounded-xl bg-gold/20"
                  role="status"
                  aria-busy="true"
                  aria-label="Checking your Oracle balance"
                />
              ) : locked ? (
                <>
                  <button
                    type="button"
                    onClick={() => setCheckoutOpen(true)}
                    className="btn-ghost mt-4 rounded-xl border border-gold/30 px-4 py-3 text-center font-semibold"
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
                    View spread detail<span className="sr-only">: {s.name}</span>
                  </Link>
                </>
              ) : (
                <Link
                  href={`/spreads/${s.slug}`}
                  className="btn-ghost mt-4 block rounded-xl border border-gold/30 px-4 py-3 text-center font-semibold"
                >
                  {s.slug === "quick-insight" && !usedFree ? "Start my free reading" : "Begin reading"}
                  <span className="sr-only">: {s.name}</span>
                </Link>
              )}
              <p className="mt-4 text-sm leading-relaxed text-cream/75">
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
              {/* Sample reading, Phase 3 (3.7): one distinct sample
                  per spread from src/lib/spread-samples.ts, written
                  for that spread's positions. The old shared template
                  rendered the same Star / Sun / Magician meanings for
                  every spread. Template text, no AI generation, no
                  Oracle spent, clearly labelled. */}
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-goldbright">See a sample reading</summary>
                <div className="mt-2 space-y-2">
                  <p className="text-xs italic text-mist">Sample, not your reading. Your reading uses your question and your cards.</p>
                  <p className="text-xs leading-relaxed text-cream/80">
                    {SPREAD_SAMPLES[s.slug]}
                  </p>
                </div>
              </details>
            </div>
          </motion.article>
          );
        })}
      </div>

      <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-gold/20 bg-panel/50 p-6 text-center">
        <h2 className="font-display text-2xl text-goldbright">Oracles</h2>
        <p className="mt-2 text-sm leading-relaxed text-cream/75">
          Oracles never expire, no subscription.{" "}
          <Link href="/faq#what-are-the-five-oracle-rules" className="font-semibold text-goldbright underline underline-offset-4">
            See all five Oracle rules
          </Link>
        </p>
        <button
          type="button"
          onClick={() => setCheckoutOpen(true)}
          className="btn-ghost mt-4 rounded-xl px-6 py-3 text-sm font-semibold"
        >
          View Oracle packs
        </button>
      </div>

      <CheckoutModal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} />
    </div>
  );
}
