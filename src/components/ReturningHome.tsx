"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getCard, orientationMeaning } from "@/lib/cards";
import {
  freeReadingUsed,
  getDailyCard,
  getDailyStreak,
  getHistory,
  todayKey,
  type DailyCardState,
} from "@/lib/storage";
import { deviceHeldSession, useAuth } from "@/components/AuthProvider";
import { isFreeAvailableFor } from "@/lib/free-reading";
import { parseReading } from "@/lib/readingMarkdown";
import type { Reading } from "@/lib/types";

// Remodel Phase 1 batch 3 (Velu, 2026-11-14): the returning-user
// home. The homepage is dynamic: a new visitor gets the cold
// landing copy (hero, sample, How it works), a returning visitor
// gets this instead — greeting + date, today's card large + one
// line, one button with its cost labelled, the balance, "Your
// thread", and the journal/streak line. No separate route: the
// switch lives in src/app/page.tsx, driven by the device signals
// there. The Raven quote from the mockup is held until the art
// exists (plan), and the mockup's re-draw line is left out on
// purpose: the daily card is one a day, so nothing here promises
// a second one. There is no first-free promise anywhere in this
// file: a visitor who already used the free reading and has no
// account lands here too, and the button shows the paid cost.
//
// Reuse, no new data sources: the daily card + streak + journal
// come from storage.ts, the latest reading merges the server
// history the same way ReturnLoop and the journal page do, and
// the cost label uses the same free-availability rule as the hero
// (Batch 6a pattern, fails closed while auth loads).

function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function dateLine(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// A card meaning is a short paragraph; the card shows its first
// sentence only, so the reading stays one line (same helper as
// TodaySample).
function firstSentence(text: string): string {
  const match = text.match(/^.*?[.!?](?=\s|$)/);
  return match ? match[0] : text;
}

// The thread preview is one plain-text sentence. Saved interpretations
// are light markdown: a heading line above the prose breaks a naive
// first-sentence regex (it cannot match across the newline), which
// falls back to the whole reading with raw markers (Copilot, PR #85).
// Use the shared parser, take the first non-heading prose block,
// collapse the whitespace, then take the first sentence, capped so
// the tile stays a preview even when the first sentence runs long.
function previewLine(text: string): string {
  const block = parseReading(text).find(
    (b) => !b.heading && !b.rule && !b.list
  );
  const plain = (
    block ? block.words.map((w) => w.text).join(" ") : text
  )
    .replace(/\s+/g, " ")
    .trim();
  const first = firstSentence(plain);
  return first.length > 160 ? `${first.slice(0, 157).trimEnd()}…` : first;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function relativeDay(iso: string): string {
  const d = new Date(iso);
  const key = dayKey(d);
  if (key === todayKey()) return "today";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (key === dayKey(y)) return "yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

// Cards that keep appearing: count every drawn card across the
// journal, most frequent first, top three. A card drawn once
// still shows (with its count); the empty states below cover
// having no readings at all.
function topRepeats(readings: Reading[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of readings) {
    for (const c of r.cards ?? []) {
      counts.set(c.cardId, (counts.get(c.cardId) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([cardId, count]) => ({
      name: getCard(cardId)?.name ?? cardId,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 3);
}

export default function ReturningHome() {
  const [loaded, setLoaded] = useState(false);
  const [daily, setDaily] = useState<DailyCardState | null>(null);
  const [streak, setStreak] = useState(0);
  const [latest, setLatest] = useState<Reading | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [repeats, setRepeats] = useState<{ name: string; count: number }[]>([]);
  const [journalCount, setJournalCount] = useState(0);
  // Same free-availability inputs as the hero and ReturnLoop:
  // signed-in users by the server record, guests by the device
  // flag, failing closed while auth loads.
  const { user, credits, freeReadingAvailable, authFailed, loading: authLoading } = useAuth();
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
    // ReturnLoop pattern: local reads in a microtask past the
    // effect, server history merged the same way the journal page
    // does. GET returns an empty list when signed out, so this is
    // safe for guests too.
    const local = getHistory();
    const pick = (list: Reading[]) => {
      const sorted = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const first = sorted[0] ?? null;
      setLatest(first);
      setFirstName(first?.firstName ?? null);
      setRepeats(topRepeats(list));
      setJournalCount(list.length);
    };
    queueMicrotask(() => {
      setDaily(getDailyCard());
      setStreak(getDailyStreak());
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
  const now = new Date();
  const greeting = greetingFor(now);
  const name = firstName ? `, ${firstName}` : "";
  const card = daily ? getCard(daily.cardId) : undefined;
  const line =
    daily && card ? firstSentence(orientationMeaning(card, daily.reversed)) : null;
  const threadLine = latest
    ? latest.interpretation
      ? previewLine(latest.interpretation)
      : (latest.question ?? null)
    : null;

  return (
    <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6" aria-label="Returning home">
      <h1 className="font-display text-4xl leading-tight text-goldbright sm:text-5xl">
        {greeting}
        {name}
      </h1>
      <p className="mt-2 text-mist">{dateLine(now)}</p>

      {/* Today's card, large. Drawn: the card + one line. Not drawn
          yet: a plain prompt, not a placeholder card — day 1 must
          not look broken, and nothing here draws a card for the
          visitor. A drawn card links to /daily to see it; a second
          draw the same day returns the same stored card there. */}
      {daily && card ? (
        <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="relative h-48 w-28 shrink-0 overflow-hidden rounded-xl border border-gold/40 shadow-[0_8px_30px_rgba(0,0,0,0.6)] sm:h-56 sm:w-32">
            <Image
              src={card.image}
              alt={card.name}
              fill
              sizes="128px"
              className="object-cover"
            />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-gold">
              Today&apos;s card
            </p>
            <h2 className="mt-2 font-display text-3xl text-goldbright sm:text-4xl">
              {card.name}
              {daily.reversed ? " (Reversed)" : ""}
            </h2>
            {line && (
              <p className="mt-3 max-w-md text-base italic leading-relaxed text-cream/85">
                &ldquo;{line}&rdquo;
              </p>
            )}
            <Link
              href="/daily"
              className="mt-4 inline-block font-semibold text-goldbright underline underline-offset-4"
            >
              See today&apos;s card
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-8">
          <p className="text-xs uppercase tracking-[0.35em] text-gold">
            Today&apos;s card
          </p>
          <p className="mt-3 text-cream/90">You have not drawn today&apos;s card yet.</p>
          <Link
            href="/daily"
            className="btn-ghost mt-4 inline-block rounded-2xl px-8 py-3.5 font-semibold"
          >
            Draw today&apos;s card
          </Link>
        </div>
      )}

      {/* One button, cost labelled. The free reading stays 1-card
          Quick Insight only; the paid cost is 1 Oracle. */}
      <Link
        href="/intake/quick-insight"
        className="btn-gold mt-8 inline-block rounded-2xl px-8 py-4 text-base font-bold sm:text-lg"
      >
        {freeAvailable ? "Ask today's question — free" : "Ask today's question · 1 Oracle"}
      </Link>
      <p className="mt-3 text-sm text-mist">
        {credits === null ? (
          "Your balance is loading."
        ) : (
          <>
            Your balance: {credits} {credits === 1 ? "Oracle" : "Oracles"} ·{" "}
            <Link
              href="/oracles"
              className="font-semibold text-goldbright underline underline-offset-4"
            >
              Top up
            </Link>
          </>
        )}
      </p>

      {/* Your thread: the last reading, and the cards that keep
          appearing. Day 1 (no readings) and day 2 (one reading, a
          1-day streak) get plain sentences, not empty boxes. */}
      <h2 className="mt-12 font-display text-3xl text-goldbright sm:text-4xl">
        Your thread
      </h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-gold/20 bg-panel/60 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-gold">Last reading</p>
          {latest ? (
            <>
              <p className="mt-2 text-cream/90">
                <span className="font-semibold text-goldbright">{latest.spreadName}</span>
                {" — "}
                {relativeDay(latest.createdAt)}
              </p>
              {threadLine && (
                <p className="mt-2 text-sm italic leading-relaxed text-cream/80">
                  &ldquo;{threadLine}&rdquo;
                </p>
              )}
              <Link
                href={`/reading/${latest.id}`}
                className="mt-3 inline-block font-semibold text-goldbright underline underline-offset-4"
              >
                Open it
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-cream/90">
                Your thread starts with your first reading.
              </p>
              <Link
                href="/intake/quick-insight"
                className="mt-3 inline-block font-semibold text-goldbright underline underline-offset-4"
              >
                Start a reading
              </Link>
            </>
          )}
        </div>
        <div className="rounded-2xl border border-gold/20 bg-panel/60 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-gold">
            Cards that keep appearing
          </p>
          {repeats.length > 0 ? (
            <p className="mt-2 text-cream/90">
              {repeats.map((r) => `${r.name} × ${r.count}`).join(" · ")}
            </p>
          ) : (
            <p className="mt-2 text-cream/90">
              Nothing repeating yet — each reading adds to the pattern.
            </p>
          )}
        </div>
      </div>

      {/* Journal + streak line. A 0-day streak reads as "not started
          yet" and a 1-day streak as "1 day", so neither looks broken. */}
      <p className="mt-8 text-sm text-mist">
        {journalCount === 0
          ? "Your journal: no readings saved yet"
          : `Your journal: ${journalCount} reading${journalCount === 1 ? "" : "s"} saved`}
        {" · "}
        {streak === 0
          ? "Daily card streak: not started yet"
          : streak === 1
            ? "Daily card streak: 1 day"
            : `Daily card streak: ${streak} days`}
      </p>
      <Link
        href="/journal"
        className="mt-2 inline-block text-sm text-mist underline underline-offset-4"
      >
        See all past readings
      </Link>
    </section>
  );
}
