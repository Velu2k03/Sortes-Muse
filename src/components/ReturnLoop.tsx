"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCard } from "@/lib/cards";
import { getDailyCard, getDailyStreak, getHistory, freeReadingUsed } from "@/lib/storage";
import { useAuth, deviceHeldSession } from "@/components/AuthProvider";
import { isFreeAvailableFor } from "@/lib/free-reading";

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
  "End the day by naming one thing you are glad you noticed.",
];

export default function ReturnLoop() {
  const [loaded, setLoaded] = useState(false);
  const [dailyName, setDailyName] = useState<string | null>(null);
  const [dailyReversed, setDailyReversed] = useState(false);
  const [streak, setStreak] = useState(0);
  const [latest, setLatest] = useState<{ id: string; question?: string; spreadName: string; createdAt: string } | null>(null);
  // Batch 6a (Batch 1 drift): the "no readings" branch used to
  // promise a free reading to everyone, but the server charges a
  // signed-in user who already used it. Same pattern as
  // SpreadsClient: signed-in users are decided by the server
  // record, guests by the device flag, and the label fails closed
  // while auth is loading.
  const { user, freeReadingAvailable, authFailed, loading: authLoading } = useAuth();
  const [usedFree, setUsedFree] = useState(false);
  const [hadSession, setHadSession] = useState(false);
  useEffect(() => {
    queueMicrotask(() => {
      setUsedFree(freeReadingUsed());
      setHadSession(deviceHeldSession());
    });
  }, []);
  const freeAvailable =
    !authLoading &&
    isFreeAvailableFor({
      slug: "quick-insight",
      signedIn: !!user,
      serverFree: freeReadingAvailable,
      deviceFree: !usedFree,
      hadSession,
      authFailed,
    });

  useEffect(() => {
    // Phase 4C lint: the mount restore sets state a microtask past
    // the effect. The server fetch stays outside it: it already sets
    // state only in async callbacks, and it must fire on mount without
    // waiting for the microtask.
    const local = getHistory();
    const pick = (list: typeof local) => {
      const sorted = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      if (sorted.length > 0) setLatest(sorted[0]);
    };
    queueMicrotask(() => {
      const daily = getDailyCard();
      if (daily) {
        setDailyName(getCard(daily.cardId)?.name ?? null);
        setDailyReversed(daily.reversed);
      }
      setStreak(getDailyStreak());
      // Codex review on PR 51, correct: signed-in users whose readings
      // live only on the server got "no readings saved yet" here,
      // because this read local storage only. Merge server history the
      // same way the journal page does; GET returns an empty list when
      // signed out, so this is safe for guests too.
      pick(local);
      setLoaded(true);
    });
    fetch("/api/history")
      .then((r) => r.json())
      .then((d) => {
        const server = Array.isArray(d.readings) ? d.readings : [];
        const seen = new Set(local.map((r) => r.id));
        const merged = [...local];
        for (const r of server) {
          if (!seen.has(r.id)) merged.push(r);
        }
        pick(merged);
      })
      .catch(() => {});
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
              {dailyName ? "See today's card" : "Draw today's card"}
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
                <p className="mt-2 text-cream/90">
                  {freeAvailable
                    ? "No readings saved yet. Your first Quick Insight is free."
                    : "No readings saved yet."}
                </p>
                <Link href="/spreads/quick-insight" className="mt-3 inline-block font-semibold text-goldbright underline underline-offset-4">
                  {freeAvailable ? "Start my free reading" : "Start a reading"}
                </Link>
              </>
            )}
            <Link href="/journal" className="mt-3 block text-sm text-mist underline underline-offset-4">
              See all past readings
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
