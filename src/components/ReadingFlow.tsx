"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getSpread, drawCards } from "@/lib/tarot";
import type { DrawnCard, Spread } from "@/lib/types";
import {
  getCard,
  orientationKeywords,
  orientationMeaning,
} from "@/lib/cards";
import {
  freeReadingUsed,
  markFreeReadingUsed,
  makeReading,
} from "@/lib/storage";
import { useAuth } from "@/components/AuthProvider";
import TarotCard from "@/components/TarotCard";
import CheckoutModal from "@/components/CheckoutModal";
import {
  trackReadingStarted,
  trackReadingCompleted,
} from "@/components/Analytics";

type Phase = "gate" | "shuffling" | "dealt" | "revealed";

interface Props {
  slug: string;
  /** Phase 5 intake data (category, story, question, first name). Phase 6 uses it for AI. */
  intake?: {
    category: string;
    question: string;
    firstName: string;
  } | null;
}

export default function ReadingFlow({ slug, intake = null }: Props) {
  const spread: Spread = useMemo(() => getSpread(slug), [slug]);
  const [phase, setPhase] = useState<Phase>("gate");
  const [drawn, setDrawn] = useState<DrawnCard[]>([]);
  const [revealed, setRevealed] = useState<boolean[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [usedFree, setUsedFree] = useState(false);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [burst, setBurst] = useState<number | null>(null);
  const savedRef = useRef(false);
  const { credits, spend, persistReading } = useAuth();

  useEffect(() => {
    setUsedFree(freeReadingUsed());
  }, []);

  const isFreeAvailable = spread.slug === "quick-insight" && !usedFree;
  const needsCredit = !isFreeAvailable;

  const begin = useCallback(async () => {
    if (needsCredit) {
      if ((credits ?? 0) < 1) {
        setCheckoutOpen(true);
        return;
      }
      const ok = await spend(1);
      if (!ok) {
        setCheckoutOpen(true);
        return;
      }
    } else {
      markFreeReadingUsed();
      setUsedFree(true);
    }
    trackReadingStarted(spread.slug);
    setPhase("shuffling");
    setTimeout(() => {
      const cards = drawCards(spread);
      setDrawn(cards);
      setRevealed(cards.map(() => false));
      savedRef.current = false;
      setPhase("dealt");
    }, 1800);
  }, [needsCredit, spread, credits, spend]);

  const flip = (i: number) => {
    if (revealed[i]) return;
    const next = [...revealed];
    next[i] = true;
    setRevealed(next);
    // Golden spark burst on the freshly revealed card.
    setBurst(i);
    setTimeout(() => setBurst((b) => (b === i ? null : b)), 950);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(12);
      } catch {
        /* noop */
      }
    }
  };

  const revealedCount = revealed.filter(Boolean).length;
  const allRevealed = drawn.length > 0 && revealedCount === drawn.length;

  // Persist the reading once everything is revealed.
  useEffect(() => {
    if (phase === "dealt" && allRevealed && !savedRef.current) {
      savedRef.current = true;
      const interpretation = drawn
        .map((d) => {
          const c = getCard(d.cardId);
          return `${d.position}: ${c.name} (${d.reversed ? "reversed" : "upright"}). ${orientationMeaning(c, d.reversed)}`;
        })
        .join("\n\n");
      const reading = makeReading({
        spreadSlug: spread.slug,
        spreadName: spread.name,
        cards: drawn,
        interpretation,
        aiGenerated: false,
        category: intake?.category,
        question: intake?.question,
        firstName: intake?.firstName,
        free: isFreeAvailable,
      });
      void persistReading(reading);
      setReadingId(reading.id);
      setPhase("revealed");
      trackReadingCompleted(spread.slug, !isFreeAvailable);
    }
  }, [phase, allRevealed, drawn, spread, intake, isFreeAvailable, persistReading]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <AnimatePresence mode="wait">
        {phase === "gate" && (
          <GateScreen
            key="gate"
            spread={spread}
            isFreeAvailable={isFreeAvailable}
            credits={credits ?? 0}
            onBegin={begin}
            onTopUp={() => setCheckoutOpen(true)}
          />
        )}

        {phase === "shuffling" && (
          <motion.div
            key="shuffling"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex min-h-[50vh] flex-col items-center justify-center"
            aria-live="polite"
          >
            <div className="flex gap-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.div
                  key={i}
                  animate={{ rotate: [0, -8, 8, -5, 5, 0], y: [0, -14, 0] }}
                  transition={{
                    duration: 1.6,
                    repeat: 1,
                    delay: i * 0.12,
                    ease: "easeInOut",
                  }}
                >
                  <TarotCard cardId={null} size="sm" disabled />
                </motion.div>
              ))}
            </div>
            <p className="mt-10 font-display text-3xl italic text-goldbright">
              Shuffling the deck…
            </p>
            <p className="mt-3 max-w-sm text-center text-sm text-mist">
              Hold your question lightly in mind. The cards will be laid face
              down for you to reveal.
            </p>
          </motion.div>
        )}

        {phase === "dealt" && (
          <motion.div
            key="dealt"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center"
          >
            <p className="text-xs uppercase tracking-[0.3em] text-gold">
              {spread.name}
            </p>
            <h1 className="mt-2 text-center font-display text-4xl text-cream">
              Tap each card to reveal it
            </h1>
            <p className="mt-2 text-sm text-mist" aria-live="polite">
              {revealedCount} of {drawn.length} revealed
            </p>
            <div className="mt-8 w-full">
              <SpreadLayout
                spread={spread}
                drawn={drawn}
                revealed={revealed}
                burst={burst}
                onFlip={flip}
              />
            </div>
          </motion.div>
        )}

        {phase === "revealed" && (
          <RevealedScreen
            key="revealed"
            spread={spread}
            drawn={drawn}
            readingId={readingId}
            wasFree={isFreeAvailable}
          />
        )}
      </AnimatePresence>

      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        reason="This reading uses 1 credit. Top up to continue."
      />
    </div>
  );
}

/* ---------------- Gate ---------------- */

function GateScreen({
  spread,
  isFreeAvailable,
  credits,
  onBegin,
  onTopUp,
}: {
  spread: Spread;
  isFreeAvailable: boolean;
  credits: number;
  onBegin: () => void;
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
                <span className="text-mist"> — {p.hint}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-8">
        {isFreeAvailable ? (
          <>
            <button
              type="button"
              onClick={onBegin}
              className="btn-gold w-full rounded-2xl px-8 py-4 text-lg font-bold sm:w-auto"
            >
              ✦ Begin your free reading
            </button>
            <p className="mt-3 text-sm text-mist">
              Free, no card required. One per seeker.
            </p>
          </>
        ) : credits >= 1 ? (
          <>
            <button
              type="button"
              onClick={() => router.push(`/intake/${spread.slug}`)}
              className="btn-gold w-full rounded-2xl px-8 py-4 text-lg font-bold sm:w-auto"
            >
              ✦ Personalize and begin · 1 credit
            </button>
            <p className="mt-3 text-sm text-mist">
              You have {credits} {credits === 1 ? "credit" : "credits"}. Tell
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
              ✦ Get credits · 1 credit per reading
            </button>
            <p className="mt-3 text-sm text-mist">
              You are out of credits. Packs start at $3.99 for 5 readings.
            </p>
          </>
        )}
      </div>

      <p className="mx-auto mt-8 max-w-md text-xs italic leading-relaxed text-mist/80">
        Readings are for self-reflection and perspective, not guaranteed
        predictions. Take what resonates, leave the rest.
      </p>
    </motion.div>
  );
}

/* ---------------- Spread layout ---------------- */

function SpreadLayout({
  spread,
  drawn,
  revealed,
  burst,
  onFlip,
}: {
  spread: Spread;
  drawn: DrawnCard[];
  revealed: boolean[];
  burst: number | null;
  onFlip: (i: number) => void;
}) {
  const cardAt = (key: string) => {
    const i = spread.positions.findIndex((p) => p.key === key);
    return { draw: drawn[i], index: i };
  };

  if (spread.slug === "quick-insight") {
    return (
      <div className="flex justify-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <TarotCard
            cardId={drawn[0].cardId}
            reversed={drawn[0].reversed}
            revealed={revealed[0]}
            onFlip={() => onFlip(0)}
            size="lg"
            label={drawn[0].position}
            celebrate={burst === 0}
          />
        </motion.div>
      </div>
    );
  }

  if (spread.slug === "past-present-future") {
    return (
      <div className="flex flex-wrap items-start justify-center gap-4 sm:gap-8">
        {drawn.map((d, i) => (
          <motion.div
            key={d.positionKey}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.15, duration: 0.5 }}
          >
            <TarotCard
              cardId={d.cardId}
              reversed={d.reversed}
              revealed={revealed[i]}
              onFlip={() => onFlip(i)}
              size="md"
              label={d.position}
              celebrate={burst === i}
            />
          </motion.div>
        ))}
      </div>
    );
  }

  // Celtic Cross: classic formation on large screens, flowing grid below.
  const present = cardAt("present");
  const challenge = cardAt("challenge");
  const cross = ["above", "past", "future", "below"].map(cardAt);
  const staff = ["advice", "external", "hopes", "outcome"].map(cardAt);

  const mini = (
    { draw, index }: { draw: DrawnCard; index: number },
    label?: string
  ) => (
    <TarotCard
      key={draw.positionKey}
      cardId={draw.cardId}
      reversed={draw.reversed}
      revealed={revealed[index]}
      onFlip={() => onFlip(index)}
      size="sm"
      label={label ?? draw.position}
      celebrate={burst === index}
    />
  );

  return (
    <>
      {/* Large screens: true cross + staff */}
      <div className="hidden justify-center gap-10 lg:flex">
        <div className="grid grid-cols-3 items-center gap-6">
          <div className="col-start-2">{mini(cross[0])}</div>
          <div>{mini(cross[1])}</div>
          <div className="relative flex justify-center">
            {mini(present)}
            <div className="absolute inset-0 flex items-center justify-center">
              <div style={{ transform: "rotate(90deg) scale(0.92)" }}>
                <TarotCard
                  cardId={challenge.draw.cardId}
                  reversed={challenge.draw.reversed}
                  revealed={revealed[challenge.index]}
                  onFlip={() => onFlip(challenge.index)}
                  size="sm"
                  label={challenge.draw.position}
                  celebrate={burst === challenge.index}
                />
              </div>
            </div>
          </div>
          <div>{mini(cross[2])}</div>
          <div className="col-start-2">{mini(cross[3])}</div>
        </div>
        <div className="flex flex-col justify-center gap-5 border-l border-gold/20 pl-10">
          {staff.map((s) => mini(s))}
        </div>
      </div>
      {/* Small screens: flowing grid in positional order */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:hidden">
        {drawn.map((d, i) => (
          <motion.div
            key={d.positionKey}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.08, 0.6), duration: 0.45 }}
            className="flex justify-center"
          >
            <TarotCard
              cardId={d.cardId}
              reversed={d.reversed}
              revealed={revealed[i]}
              onFlip={() => onFlip(i)}
              size="sm"
              label={d.position}
              celebrate={burst === i}
            />
          </motion.div>
        ))}
      </div>
    </>
  );
}

/* ---------------- Revealed ---------------- */

function RevealedScreen({
  spread,
  drawn,
  readingId,
  wasFree,
}: {
  spread: Spread;
  drawn: DrawnCard[];
  readingId: string | null;
  wasFree: boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-gold">
          Your reading
        </p>
        <h1 className="mt-3 font-display text-5xl text-goldbright">
          {spread.name}
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-sm italic text-mist">
          Read each card slowly. Notice which one pulls at you before you read
          a single meaning. Your first impression matters.
        </p>
      </div>

      <div className="mx-auto mt-10 max-w-3xl space-y-5">
        {drawn.map((d, i) => {
          const card = getCard(d.cardId);
          return (
            <motion.section
              key={d.positionKey}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5 }}
              className="rounded-3xl border border-gold/20 bg-panel/60 p-6 sm:p-7"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-gold">
                    {i + 1} · {d.position}
                  </p>
                  <h2 className="mt-1 font-display text-3xl text-cream">
                    {card.name}
                    <span className="ml-2 align-middle text-sm font-body font-normal text-mist">
                      {d.reversed ? "reversed" : "upright"}
                    </span>
                  </h2>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {orientationKeywords(card, d.reversed).map((k) => (
                  <span
                    key={k}
                    className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs text-goldbright"
                  >
                    {k}
                  </span>
                ))}
              </div>
              <p className="mt-4 leading-relaxed text-cream/90">
                {orientationMeaning(card, d.reversed)}
              </p>
            </motion.section>
          );
        })}
      </div>

      <div className="mx-auto mt-10 max-w-3xl rounded-3xl border border-gold/30 bg-navydeep/70 p-6 text-center sm:p-8">
        <p className="font-display text-2xl italic text-goldbright">
          “The cards suggest; you decide.”
        </p>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-cream/75">
          This reading is saved to your journal. Sit with it for a day before
          drawing again on the same question, and notice which card keeps
          returning to you.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          {readingId && (
            <Link
              href={`/reading/${readingId}`}
              className="btn-gold rounded-xl px-6 py-3 font-bold"
            >
              View & share reading
            </Link>
          )}
          <Link
            href="/history"
            className="btn-ghost rounded-xl px-6 py-3 font-semibold"
          >
            Open journal
          </Link>
        </div>
      </div>

      {wasFree && (
        <div className="mx-auto mt-6 max-w-3xl rounded-3xl border border-violet/30 bg-violet/10 p-6 text-center sm:p-8">
          <p className="font-display text-2xl text-cream">
            Want to go deeper?
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-cream/75">
            The Celtic Cross lays ten cards across your whole landscape:
            forces, hopes, and outcome. Unlock it with 1 credit.
          </p>
          <Link
            href="/spreads/celtic-cross"
            className="btn-gold mt-5 inline-block rounded-xl px-8 py-3 font-bold"
          >
            Unlock the Celtic Cross
          </Link>
        </div>
      )}

      <p className="mx-auto mt-8 max-w-md text-center text-xs italic leading-relaxed text-mist/80">
        For reflection and perspective, not guaranteed predictions. If a
        reading touches on health, it is wellness reflection only and never a
        diagnosis; please consult a licensed professional for medical
        guidance.
      </p>
    </motion.div>
  );
}
