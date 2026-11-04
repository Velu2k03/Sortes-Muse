"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCard } from "@/lib/cards";
import { getDailyCard, getDailyStreak, getHistory } from "@/lib/storage";

// Deep UX Batch B, home return loop: a daily quote, today's daily
// card status, and the latest journal reading, on home itself, so a
// returning user has a personal reason to come back. Quotes are
// original lines written for Sortes, with no attribution, never
// presented as someone else's words. No streak pressure: the streak
// is shown only when it already exists, and nothing here resets
// punitively or sells a repair.
const QUOTES = [
  "Start small. One honest question is enough for today.",
  "Notice what keeps returning. Patterns speak quietly.",
  "A pause is also a choice. Let the day catch up with you.",
  "Ask what this moment is asking of you, not what it owes you.",
  "Write one line about today. Tomorrow will thank you for it.",
  "The card is a mirror, not a map. Look, then decide for yourself.",
  "End the day by naming one thing you are glad you noticed.",
];

export default function ReturnLoop() {
  const [loaded, setLoaded] = useState(false);
  const [dailyName, setDailyName] = useState<string | null>(null);
  const [dailyReversed, setDailyReversed] = useState(false);
  const [streak, setStreak] = useState(0);
  const [latest, setLatest] = useState<{ id: string; question?: string; spreadName: string; createdAt: string } | null>(null);

  useEffect(() => {
    const daily = getDailyCard();
    if (daily) {
      setDailyName(getCard(daily.cardId)?.name ?? null);
      setDailyReversed(daily.reversed);
    }
    setStreak(getDailyStreak());
    const history = getHistory();
    if (history.length > 0) setLatest(history[0]);
    setLoaded(true);
  }, []);

  if (!loaded) return null;
  const quote = QUOTES[new Date().getDay()];

  return (
    <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6" aria-label="Your return">
      <div className="rounded-3xl border border-gold/25 bg-panel/60 p-6 sm:p-8">
        <p className="text-center font-display text-2xl italic text-goldbright">&ldquo;{quote}&rdquo;</p>
        <p className="mt-2 text-center text-xs text-mist">A small reminder for today, not a prediction.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-gold/20 bg-ink/40 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-gold">Today&apos;s card</p>
            {dailyName ? (
              <p className="mt-2 text-cream/90">
                You drew <span className="font-semibold text-goldbright">{dailyName}</span>
                {dailyReversed ? " (Reversed)" : ""} today.
              </p>
            ) : (
              <p className="mt-2 text-cream/90">You have not drawn today&apos;s card yet.</p>
            )}
            <Link href="/daily" className="mt-3 inline-block font-semibold text-goldbright underline underline-offset-4">
              {dailyName ? "See today's card" : "Draw today's card, free"}
            </Link>
            {streak >= 2 && (
              <p className="mt-2 text-sm text-mist">
                <span className="num">{streak}</span>-day streak, kept simply by drawing each day.
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-gold/20 bg-ink/40 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-gold">Your journal</p>
            {latest ? (
              <>
                <p className="mt-2 text-cream/90">
                  Last: <span className="font-semibold text-goldbright">{latest.spreadName}</span>
                  {latest.question ? `, "${latest.question}"` : ""}
                </p>
                <Link href={`/reading/${latest.id}`} className="mt-3 inline-block font-semibold text-goldbright underline underline-offset-4">
                  Continue it
                </Link>
              </>
            ) : (
              <>
                <p className="mt-2 text-cream/90">No readings saved yet. Your first Quick Insight is free.</p>
                <Link href="/spreads/quick-insight" className="mt-3 inline-block font-semibold text-goldbright underline underline-offset-4">
                  Begin my free reading
                </Link>
              </>
            )}
            <Link href="/history" className="mt-3 block text-sm text-mist underline underline-offset-4">
              See all past readings
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
