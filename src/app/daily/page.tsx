"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getDailyCard,
  setDailyCard,
  getDailyStreak,
  type DailyCardState,
} from "@/lib/storage";
import { getCard, orientationKeywords, orientationMeaning } from "@/lib/cards";
import { drawSingle } from "@/lib/tarot";
import TarotCard from "@/components/TarotCard";
import CardModal from "@/components/CardModal";
import { trackDailyCardDrawn } from "@/components/Analytics";

type Phase = "idle" | "shuffling" | "revealed";

/**
 * Daily Card: one free card per day, zero intake, zero friction.
 * The drawn card is stored with the date; returning the same day shows it.
 */
export default function DailyPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [daily, setDaily] = useState<DailyCardState | null>(null);
  const [streak, setStreak] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);

  useEffect(() => {
    const existing = getDailyCard();
    if (existing) {
      setDaily(existing);
      setPhase("revealed");
    }
    setStreak(getDailyStreak());
  }, []);

  const draw = () => {
    setPhase("shuffling");
    // A short ritual pause before the card appears.
    setTimeout(() => {
      const d = drawSingle();
      const saved = setDailyCard(d.cardId, d.reversed);
      setDaily(saved);
      setStreak(getDailyStreak());
      setPhase("revealed");
      trackDailyCardDrawn();
    }, 1400);
  };

  const card = daily ? getCard(daily.cardId) : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-12 sm:px-6">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">
        A daily ritual
      </p>
      <h1 className="mt-3 text-center font-display text-5xl text-goldbright sm:text-6xl">
        Your Daily Card
      </h1>
      <p className="mt-4 max-w-md text-center text-cream/75">
        One card, free forever, no questions asked. A small mirror for the day
        ahead.
      </p>
      {streak >= 2 && (
        <motion.p
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5 text-sm font-semibold text-goldbright"
        >
          <span aria-hidden="true">🔥</span> {streak}-day streak
        </motion.p>
      )}

      <div className="mt-10 flex min-h-[24rem] w-full flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          {phase === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center"
            >
              <TarotCard cardId={null} size="lg" disabled />
              <button
                type="button"
                onClick={draw}
                className="btn-gold mt-8 rounded-2xl px-10 py-4 text-lg font-bold"
              >
                ✦ Draw today&apos;s card
              </button>
            </motion.div>
          )}

          {phase === "shuffling" && (
            <motion.div
              key="shuffling"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center"
              aria-live="polite"
            >
              <motion.div
                animate={{ rotate: [0, -4, 4, -3, 3, 0], y: [0, -10, 0] }}
                transition={{ duration: 1.3, ease: "easeInOut" }}
              >
                <TarotCard cardId={null} size="lg" disabled />
              </motion.div>
              <p className="mt-8 font-display text-2xl italic text-goldbright">
                The lots are being cast…
              </p>
            </motion.div>
          )}

          {phase === "revealed" && card && daily && (
            <motion.div
              key="revealed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex w-full flex-col items-center"
            >
              <TarotCard
                cardId={daily.cardId}
                reversed={daily.reversed}
                revealed
                size="lg"
                label={daily.reversed ? "Reversed" : "Upright"}
                onFlip={() => setZoomOpen(true)}
              />
              <p className="mt-3 text-xs text-mist">Tap the card to enlarge it.</p>
              {zoomOpen && (
                <CardModal cardId={daily.cardId} onClose={() => setZoomOpen(false)} />
              )}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.6 }}
                className="mt-8 w-full rounded-3xl border border-gold/25 bg-panel/70 p-6 text-center sm:p-8"
              >
                <h2 className="font-display text-4xl text-goldbright">
                  {card.name}
                </h2>
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  {orientationKeywords(card, daily.reversed).map((k) => (
                    <span
                      key={k}
                      className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs text-goldbright"
                    >
                      {k}
                    </span>
                  ))}
                </div>
                <p className="mx-auto mt-5 max-w-lg leading-relaxed text-cream/90">
                  {orientationMeaning(card, daily.reversed)}
                </p>
                <p className="mt-6 text-xs italic text-mist">
                  A reflection for today, not a prediction. Come back tomorrow
                  for a new card
                  {streak >= 1 && (
                    <> and to keep your {streak}-day streak alive</>
                  )}
                  .
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
