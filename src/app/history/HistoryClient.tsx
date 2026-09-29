"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { getHistory } from "@/lib/storage";
import { useAuth } from "@/components/AuthProvider";
import type { Reading } from "@/lib/types";
import { getCard } from "@/lib/cards";

/**
 * Journal: reading history (localStorage for guests, DB-synced for
 * logged-in users in Phase 7). Each entry carries an "Ask a follow-up"
 * upsell into a new clarifying reading.
 */
export default function HistoryPage() {
  const { user } = useAuth();
  const [history, setHistory] = useState<Reading[] | null>(null);

  useEffect(() => {
    const local = getHistory();
    if (!user) {
      setHistory(local);
      return;
    }
    // Signed in: merge server readings with local ones (dedupe by id).
    fetch("/api/history")
      .then((r) => r.json())
      .then((d) => {
        const server: Reading[] = Array.isArray(d.readings) ? d.readings : [];
        const seen = new Set(local.map((r) => r.id));
        const merged = [...local];
        for (const r of server) {
          if (!seen.has(r.id)) merged.push(r);
        }
        merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setHistory(merged);
      })
      .catch(() => setHistory(local));
  }, [user]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-gold">Journal</p>
        <h1 className="mt-3 font-display text-5xl text-goldbright sm:text-6xl">
          Your readings
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-cream/75">
          {user
            ? "Every reading you complete is kept here and synced to your account, so your journal follows you across devices."
            : "Every reading you complete is kept here on this device. Sign in to sync your journal across devices."}
        </p>
      </div>

      {history === null && (
        <p className="py-16 text-center text-mist">Loading your journal…</p>
      )}

      {history !== null && history.length === 0 && (
        <div className="mx-auto mt-12 max-w-md rounded-3xl border border-gold/20 bg-panel/60 p-8 text-center">
          <p className="font-display text-2xl text-cream">No readings yet</p>
          <p className="mt-2 text-sm text-cream/75">
            Your first full reading is free. Cast the lots and begin.
          </p>
          <Link
            href="/spreads/quick-insight"
            className="btn-gold mt-6 inline-block rounded-xl px-8 py-3 font-bold"
          >
            Begin free reading
          </Link>
        </div>
      )}

      {history !== null && history.length > 0 && (
        <div className="mt-10 space-y-4">
          {history.map((r) => {
            const date = new Date(r.createdAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            });
            return (
              <article
                key={r.id}
                className="rounded-3xl border border-gold/20 bg-panel/60 p-5 sm:p-6"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex -space-x-3">
                    {r.cards.slice(0, 5).map((d) => (
                      <div
                        key={d.positionKey}
                        className="relative h-20 w-12 overflow-hidden rounded-md border border-gold/40 bg-navydeep"
                      >
                        <Image
                          src={getCard(d.cardId).image}
                          alt=""
                          fill
                          sizes="48px"
                          className="object-cover"
                          style={
                            d.reversed
                              ? { transform: "rotate(180deg)" }
                              : undefined
                          }
                        />
                      </div>
                    ))}
                    {r.cards.length > 5 && (
                      <div className="flex h-20 w-12 items-center justify-center rounded-md border border-gold/40 bg-navydeep text-xs text-goldbright">
                        +{r.cards.length - 5}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-[0.2em] text-mist">
                      {date} · {r.free ? "Free reading" : "1 credit"}
                      {r.aiGenerated ? " · Personalized" : ""}
                    </p>
                    <h2 className="mt-1 font-display text-2xl text-cream">
                      {r.spreadName}
                    </h2>
                    {r.question && (
                      <p className="mt-1 truncate text-sm italic text-cream/70">
                        “{r.question}”
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Link
                      href={`/reading/${r.id}`}
                      className="btn-ghost rounded-xl px-4 py-2.5 text-sm font-semibold"
                    >
                      Revisit
                    </Link>
                    <Link
                      href="/spreads/quick-insight"
                      className="btn-gold rounded-xl px-4 py-2.5 text-sm font-bold"
                      title="Draw a clarifying reading on the same question"
                    >
                      Ask a follow-up
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
