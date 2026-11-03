"use client";
import Icon from "@/components/Icon";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { getHistory } from "@/lib/storage";
import { useAuth } from "@/components/AuthProvider";
import type { Reading } from "@/lib/types";
import { getCard } from "@/lib/cards";
import {
  groupReadingsByDay,
  isRevisitEligible,
  monthlyReview,
} from "@/lib/journal";

/**
 * Journal: reading history (localStorage for guests, DB-synced for
 * signed-in users). M2.2 turns the flat list into a timeline grouped
 * by day, with a monthly pattern review and a ready-to-revisit
 * section. Follow-ups now link to the real thread on the reading
 * detail page (M2.1), not to a new reading.
 */
export default function HistoryPage() {
  const { user, deleteReading } = useAuth();
  const [history, setHistory] = useState<Reading[] | null>(null);
  // M2.2: delete arms on first tap and deletes on the second, so a
  // stray tap cannot wipe a reading. The row says one-tap delete;
  // this keeps it one action per entry while guarding the data.
  const [armedId, setArmedId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const local = getHistory();
    if (!user) {
      queueMicrotask(() => setHistory(local));
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
            ? "Every full reading and saved chart interpretation you complete is kept here and synced to your account, so your journal follows you across devices. Daily cards are not saved as full readings."
            : "Every full reading and saved chart interpretation you complete is kept here on this device. Sign in to sync your journal across devices. Daily cards are not saved as full readings."}
        </p>
      </div>

      {history === null && (
        <p className="py-16 text-center text-mist">Loading your journal…</p>
      )}

      {history !== null && history.length === 0 && (
        <div className="mx-auto mt-12 max-w-md rounded-3xl border border-gold/20 bg-panel/60 p-8 text-center">
          <p className="flex items-center justify-center gap-2 font-display text-2xl text-cream"><Icon name="iconoirBook" size={24} />No readings yet</p>
          <p className="mt-2 text-sm text-cream/75">
            Your first Quick Insight reading is free. Cast the lots and begin.
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
        <>
          {/* M2.2: monthly pattern review, computed from the seeker's
              own readings only. Free, always, no AI involved. */}
          {(() => {
            const now = new Date();
            const review = monthlyReview(
              history,
              now.getFullYear(),
              now.getMonth()
            );
            const monthLabel = now.toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            });
            return (
              <div className="mt-10 rounded-3xl border border-gold/20 bg-panel/60 p-5 sm:p-6">
                <p className="text-xs uppercase tracking-[0.25em] text-gold">
                  This month in your journal · {monthLabel}
                </p>
                {review.count === 0 ? (
                  <p className="mt-2 text-sm text-cream/75">
                    No readings this month yet. Your pattern review appears
                    here once you cast one.
                  </p>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-cream/85">
                      {review.count}{" "}
                      {review.count === 1 ? "reading" : "readings"} this
                      month
                      {review.categories.filter(
                        (c) => c.name !== "uncategorized"
                      ).length > 0 &&
                        ` · ${review.categories
                          .filter((c) => c.name !== "uncategorized")
                          .map((c) => `${c.name} ×${c.count}`)
                          .join(", ")}`}
                      {review.stepsCount > 0 &&
                        ` · ${review.stepsCount} next ${
                          review.stepsCount === 1 ? "step" : "steps"
                        } chosen`}
                      {review.followUpsCount > 0 &&
                        ` · ${review.followUpsCount} ${
                          review.followUpsCount === 1
                            ? "follow-up"
                            : "follow-ups"
                        } asked`}
                      .
                    </p>
                    {review.topCards.length > 0 && (
                      <p className="mt-1 text-sm text-cream/75">
                        Cards that kept appearing:{" "}
                        {review.topCards
                          .map(
                            (c) =>
                              `${getCard(c.cardId).name} (×${c.count})`
                          )
                          .join(", ")}
                        .
                      </p>
                    )}
                  </>
                )}
                <p className="mt-2 text-xs text-mist">
                  Computed from your own readings only. Never paywalled.
                </p>
              </div>
            );
          })()}

          {/* Personal Phase 1: repeated questions, computed from the
              seeker's own saved questions only. Normalizing case and
              punctuation links the same question across readings, so
              a thread the user keeps returning to is visible instead
              of buried in the day timeline. No AI, no invented theme. */}
          {(() => {
            const norm = (q: string) =>
              q
                .toLowerCase()
                .replace(/[^\p{L}\p{N}\s]/gu, "")
                .replace(/\s+/g, " ")
                .trim();
            const groups = new Map<string, Reading[]>();
            for (const r of history) {
              // Codex review on PR 45, correct: chart readings cannot
              // take threaded follow-ups, so a repeated-question group
              // must never select a chart as its latest entry and
              // promise a follow-up that does not exist there.
              if (!r.question || r.chartSummary) continue;
              const key = norm(r.question);
              if (!key) continue;
              const list = groups.get(key) ?? [];
              list.push(r);
              groups.set(key, list);
            }
            const repeated = [...groups.values()]
              .filter((list) => list.length > 1)
              .sort((a, b) => b.length - a.length)
              .slice(0, 3);
            if (repeated.length === 0) return null;
            return (
              <div className="mt-10 rounded-3xl border border-gold/20 bg-panel/60 p-5 sm:p-6">
                <p className="text-xs uppercase tracking-[0.25em] text-gold">
                  Questions you keep returning to
                </p>
                <p className="mt-2 text-sm text-cream/75">
                  The same question, asked more than once. Open the latest
                  reading to continue it with a follow-up, instead of
                  starting over.
                </p>
                <ul className="mt-4 space-y-2">
                  {repeated.map((list) => {
                    const latest = [...list].sort((a, b) =>
                      b.createdAt.localeCompare(a.createdAt)
                    )[0];
                    return (
                      <li
                        key={latest.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-gold/15 bg-panel/40 px-4 py-3"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-cream">
                            “{latest.question}”
                          </span>
                          <span className="num text-xs text-mist">
                            Asked {list.length} times · latest{" "}
                            {new Date(latest.createdAt).toLocaleDateString(
                              undefined,
                              {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              }
                            )}
                          </span>
                        </span>
                        <Link
                          href={`/reading/${latest.id}`}
                          className="shrink-0 text-sm font-semibold text-goldbright underline"
                        >
                          Continue it
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })()}

          {/* M2.2: readings old enough to revisit, without a note yet. */}
          {history.filter((r) => isRevisitEligible(r)).length > 0 && (
            <div className="mt-10 rounded-3xl border border-gold/20 bg-panel/60 p-5 sm:p-6">
              <p className="text-xs uppercase tracking-[0.25em] text-gold">
                Ready to revisit
              </p>
              <p className="mt-2 text-sm text-cream/75">
                A week has passed since these readings. A line on what
                shifted keeps the whole arc in your journal.
              </p>
              <ul className="mt-4 space-y-2">
                {history
                  .filter((r) => isRevisitEligible(r))
                  .map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-gold/15 bg-panel/40 px-4 py-3"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-cream">
                          {r.spreadName}
                          {r.question ? ` · “${r.question}”` : ""}
                        </span>
                        <span className="text-xs text-mist">
                          {new Date(r.createdAt).toLocaleDateString(
                            undefined,
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            }
                          )}
                        </span>
                      </span>
                      <Link
                        href={`/reading/${r.id}`}
                        className="shrink-0 text-sm font-semibold text-goldbright underline"
                      >
                        Write your note
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {deleteError && (
            <p className="mt-6 text-center text-sm text-red-400">
              {deleteError}
            </p>
          )}

          {/* M2.2: timeline, grouped by day, newest first. */}
          <div className="mt-10 space-y-8">
            {groupReadingsByDay(history).map((group) => (
              <section key={group.label}>
                <p className="text-xs uppercase tracking-[0.25em] text-gold">
                  {group.label}
                </p>
                <div className="mt-3 space-y-4">
                  {group.readings.map((r) => (
                    <article
                      key={r.id}
                      className="rounded-3xl border border-gold/20 bg-panel/60 p-5 sm:p-6"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <div className="flex -space-x-3">
                          {(r.cards ?? []).slice(0, 5).map((d) => (
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
                          {(r.cards ?? []).length > 5 && (
                            <div className="flex h-20 w-12 items-center justify-center rounded-md border border-gold/40 bg-navydeep text-xs text-goldbright">
                              +{(r.cards ?? []).length - 5}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs uppercase tracking-[0.2em] text-mist">
                            {r.free ? "Free reading" : "1 Oracle"}
                            {r.aiGenerated ? " · Personalized" : ""}
                            {(r.followUps?.length ?? 0) > 0 &&
                              ` · ${r.followUps?.length} follow-up${
                                (r.followUps?.length ?? 0) === 1 ? "" : "s"
                              }`}
                            {r.revisitNote && " · Revisited"}
                          </p>
                          <h2 className="mt-1 font-display text-2xl text-cream">
                            {r.spreadName}
                          </h2>
                          {r.question && (
                            <p className="mt-1 truncate text-sm italic text-cream/70">
                              “{r.question}”
                            </p>
                          )}
                          {r.chartSummary && (
                            <p className="mt-1 text-sm text-cream/70">{r.chartSummary}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Link
                            href={`/reading/${r.id}`}
                            className="btn-ghost rounded-xl px-4 py-2.5 text-sm font-semibold"
                          >
                            Open reading
                          </Link>
                          {r.aiGenerated &&
                            r.interpretation &&
                            !r.chartSummary && (
                              <Link
                                href={`/reading/${r.id}`}
                                className="btn-gold rounded-xl px-4 py-2.5 text-sm font-bold"
                                title="Continue the follow-up thread on this reading"
                              >
                                Follow-up
                              </Link>
                            )}
                          <button
                            type="button"
                            onClick={async () => {
                              if (armedId !== r.id) {
                                setArmedId(r.id);
                                setDeleteError(null);
                                return;
                              }
                              const ok = await deleteReading(r.id);
                              if (ok) {
                                setHistory((h) =>
                                  h ? h.filter((x) => x.id !== r.id) : h
                                );
                                setArmedId(null);
                              } else {
                                setDeleteError(
                                  "Could not delete that reading. Please try again."
                                );
                              }
                            }}
                            className="rounded-xl border border-red-400/30 px-4 py-2.5 text-sm font-semibold text-red-400"
                          >
                            {armedId === r.id
                              ? "Confirm delete?"
                              : "Delete"}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
