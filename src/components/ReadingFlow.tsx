"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { getSpread } from "@/lib/tarot";
import type { Spread } from "@/lib/types";
import { freeReadingUsed } from "@/lib/storage";
import { useAuth } from "@/components/AuthProvider";
import Breadcrumbs from "@/components/Breadcrumbs";
import CheckoutModal from "@/components/CheckoutModal";
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
  const { credits } = useAuth();

  useEffect(() => {
    queueMicrotask(() => setUsedFree(freeReadingUsed()));
  }, []);

  const isFreeAvailable = spread.slug === "quick-insight" && !usedFree;

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
  credits,
  onTopUp,
}: {
  spread: Spread;
  isFreeAvailable: boolean;
  credits: number;
  onTopUp: () => void;
}) {
  const router = useRouter();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
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

      <div className="mt-8 rounded-3xl border border-gold/20 bg-panel/60 p-6 text-left">
        <p className="text-xs uppercase tracking-[0.25em] text-gold">
          The positions
        </p>
        <ol className="mt-3 space-y-2.5">
          {spread.positions.map((p, i) => (
            <li key={p.key} className="flex gap-3 text-sm">
              <span className="font-display text-lg text-goldbright">{i + 1}</span>
              <span>
                <span className="font-semibold text-cream">{p.label}</span>
                <span className="text-mist">: {p.hint}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

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
              Free, no payment card required. One free Quick Insight per device.
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
              You are out of Oracles. Packs start at $3.99 for 5 Oracles.
            </p>
          </>
        )}
      </div>

      <p className="mx-auto mt-8 max-w-md text-xs italic leading-relaxed text-mist">
        Readings are for self-reflection and perspective, not guaranteed
        predictions. Take what resonates, leave the rest.
      </p>
    </motion.div>
  );
}
