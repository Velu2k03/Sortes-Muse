"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useCanHide } from "@/lib/use-mounted";
import { getSpread, SPREADS } from "@/lib/tarot";
import { spreadSample } from "@/lib/spread-samples";
import type { Spread } from "@/lib/types";
import { freeReadingUsed } from "@/lib/storage";
import { useAuth, deviceHeldSession } from "@/components/AuthProvider";
import { isFreeAvailableFor } from "@/lib/free-reading";
import Breadcrumbs from "@/components/Breadcrumbs";
import CheckoutModal from "@/components/CheckoutModal";
import SpreadDiagram from "@/components/SpreadDiagram";
import Link from "next/link";
import { ClickSpark } from "@/components/ReactBits";

/**
 * Spread detail page. Phase 2, 2.1: this page no longer runs a
 * reading itself. The old static-template flow dealt cards and
 * burned the first-free Quick Insight without ever asking a
 * question, while the intake flow blocked 0-Oracle first-timers
 * because it never checked the free flag. There is now ONE
 * question-first AI flow: every entry point here routes into
 * /intake/[slug], which honours the free reading and asks the
 * question before anything is generated or spent.
 */
export default function ReadingFlow({ slug }: { slug: string }) {
  const spread: Spread = useMemo(() => getSpread(slug), [slug]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [usedFree, setUsedFree] = useState(false);
  const { credits, user, freeReadingAvailable } = useAuth();

  useEffect(() => {
    queueMicrotask(() => setUsedFree(freeReadingUsed()));
  }, []);

  // Batch 1 (C1): signed-in users are decided by the server record,
  // guests by the device flag. See src/lib/free-reading.ts.
  const isFreeAvailable = isFreeAvailableFor({
    slug: spread.slug,
    signedIn: !!user,
    serverFree: freeReadingAvailable,
    deviceFree: !usedFree,
    hadSession: deviceHeldSession(),
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {/* Phase F: the flow sits under Spreads, so the way back is visible. */}
      <Breadcrumbs
        trail={[
          { href: "/", label: "Home" },
          { href: "/spreads", label: "Spreads" },
          { label: getSpread(slug).name },
        ]}
      />
      <GateScreen
        spread={spread}
        isFreeAvailable={isFreeAvailable}
        signedIn={!!user}
        credits={credits ?? 0}
        onTopUp={() => setCheckoutOpen(true)}
      />

      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        reason="This reading uses 1 Oracle. Top up to continue."
      />
    </div>
  );
}

/* ---------------- Gate ---------------- */

function GateScreen({
  spread,
  isFreeAvailable,
  signedIn,
  credits,
  onTopUp,
}: {
  spread: Spread;
  isFreeAvailable: boolean;
  signedIn: boolean;
  credits: number;
  onTopUp: () => void;
}) {
  const router = useRouter();
  const hide = useCanHide();
  return (
    <motion.div
      key={hide ? "reveal" : "static"}
      initial={hide ? { opacity: 0, y: 20 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mx-auto max-w-2xl text-center"
    >
      <p className="text-xs uppercase tracking-[0.35em] text-gold">
        {spread.cards} {spread.cards === 1 ? "card" : "cards"}
      </p>
      <h1 className="mt-3 font-display text-5xl text-goldbright sm:text-6xl">
        {spread.name}
      </h1>
      <p className="mx-auto mt-4 max-w-lg text-cream/80">{spread.description}</p>

      {/* AF-045: the layout diagram sits next to the position list,
          so a 1-card spread page is not a short list over a long
          empty page, and the layout itself teaches the spread. */}
      <div className="mt-8 rounded-3xl border border-gold/20 bg-panel/60 p-6 text-left">
        <p className="text-xs uppercase tracking-[0.25em] text-gold">
          The positions
        </p>
        <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <div className="w-40 shrink-0 sm:w-48">
            <SpreadDiagram spread={spread} />
          </div>
          <ol className="w-full space-y-2.5">
            {spread.positions.map((p, i) => (
              <li key={p.key} className="flex gap-3 text-sm">
                <span className="shrink-0 font-display text-lg leading-snug text-goldbright">{i + 1}</span>
                <span>
                  {/* AF-045: the label and its colon are one
                      non-breaking unit, so "1" and "Insight:" never
                      split across lines at 390px. */}
                  <span className="whitespace-nowrap font-semibold text-cream">{p.label}:</span>{" "}
                  <span className="text-mist">{p.hint}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* AF-077: the per-spread sample reading already exists in
          src/lib/spread-samples.ts and was shown only on the /spreads
          index. Showing it here adds the page's unique substance
          from existing copy — no new text invented. */}
      <details className="mx-auto mt-6 max-w-xl text-left">
        <summary className="cursor-pointer text-sm font-semibold text-goldbright">
          See a sample reading
        </summary>
        <div className="mt-2 space-y-2">
          <p className="text-xs italic text-mist">
            Sample, not your reading. Your reading uses your question and your cards.
          </p>
          <p className="text-sm leading-relaxed text-cream/80">
            {spreadSample(spread.slug)}
          </p>
        </div>
      </details>

      {(() => {
        const guideBySpread: Record<string, string> = {
          "celtic-cross": "/guides/celtic-cross-explained",
          "love-insight": "/guides/topic-spreads-love-career-week",
          "career-path": "/guides/topic-spreads-love-career-week",
          "weekly-outlook": "/guides/topic-spreads-love-career-week",
          "quick-insight": "/guides/how-to-ask-a-tarot-question",
          "past-present-future": "/guides/what-is-tarot",
        };
        const guide = guideBySpread[spread.slug];
        if (!guide) return null;
        return (
          <p className="mt-6 text-center text-sm text-mist">
            <Link href={guide} className="font-semibold text-goldbright underline underline-offset-4">
              Read the guide first
            </Link>
          </p>
        );
      })()}

      <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-gold/15 px-5 py-4 text-left text-sm text-mist">
        <p className="font-semibold text-cream/90">What your reading includes</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>300-600 words, shown on screen</li>
          <li>AI-written from your cards, question, and story</li>
          <li>Ready in up to about 3 minutes</li>
          <li>First follow-up free, then 1 Oracle each, up to 3</li>
        </ul>
      </div>

      <div className="mt-8">
        {isFreeAvailable ? (
          <>
            <ClickSpark className="click-spark--responsive">
              <button
                type="button"
                onClick={() => router.push(`/intake/${spread.slug}`)}
                className="btn-gold w-full rounded-2xl px-8 py-4 text-lg font-bold sm:w-auto"
              >
                ✦ Start my free reading
              </button>
            </ClickSpark>
            <p className="mt-3 text-sm text-mist">
              Free, no payment card required. One free Quick Insight per{" "}
              {signedIn ? "account" : "device"}.
            </p>
          </>
        ) : credits >= 1 ? (
          <>
            <ClickSpark className="click-spark--responsive">
              <button
                type="button"
                onClick={() => router.push(`/intake/${spread.slug}`)}
                className="btn-gold w-full rounded-2xl px-8 py-4 text-lg font-bold sm:w-auto"
              >
                ✦ Personalize and begin · 1 Oracle
              </button>
            </ClickSpark>
            <p className="mt-3 text-sm text-mist">
              You have {credits} {credits === 1 ? "Oracle" : "Oracles"}. Tell
              your story, and the reading is woven around it.
            </p>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onTopUp}
              className="btn-gold w-full rounded-2xl px-8 py-4 text-lg font-bold sm:w-auto"
            >
              ✦ Get Oracles · 1 Oracle per reading
            </button>
            <p className="mt-3 text-sm text-mist">
              This reading uses 1 Oracle. Packs start at $3.99 for 5 Oracles.
            </p>
          </>
        )}
      </div>

      <p className="mx-auto mt-8 max-w-md text-xs italic leading-relaxed text-mist">
        Readings are for self-reflection and perspective, not guaranteed
        predictions. Take what resonates, leave the rest.
      </p>

      {/* AF-045: the gate is short, so the page ended in empty black
          space. A row of the other spreads fills it with the next
          step instead of a void. */}
      <div className="mx-auto mt-12 max-w-2xl">
        <p className="text-xs uppercase tracking-[0.25em] text-gold">
          More spreads
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {SPREADS.filter((s) => s.slug !== spread.slug).map((s) => (
            <Link
              key={s.slug}
              href={`/spreads/${s.slug}`}
              className="rounded-full border border-gold/30 px-4 py-2.5 text-sm font-semibold text-cream/90 hover:bg-gold/10"
            >
              {s.name} · {s.cards === 1 ? "1 card" : `${s.cards} cards`}
            </Link>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
