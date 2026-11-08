"use client";
import Icon from "@/components/Icon";
import { SpotlightCard } from "@/components/ReactBitsNew";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { getHistory } from "@/lib/storage";
import { useAuth } from "@/components/AuthProvider";
import type { Reading } from "@/lib/types";
import { getCard } from "@/lib/cards";
import {
  buildJournalMarkdown,
  groupReadingsByDay,
  isRevisitEligible,
  monthlyReview,
  PATTERN_MIRROR_MIN_READINGS,
  patternMirror,
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
  // AF-089: false on the server and first client render, so the HTML
  // carries the real empty-state block. After mount, while the journal
  // is still loading, it is replaced by "Loading" so a user who has
  // readings is never told they have none.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setHydrated(true));
  }, []);
  // M2.2: delete arms on first tap and deletes on the second, so a
  // stray tap cannot wipe a reading. The row says one-tap delete;
  // this keeps it one action per entry while guarding the data.
  const [armedId, setArmedId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Deep UX Batch B: journal search and sort, so a growing journal
  // stays usable instead of becoming a longer list.
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const filteredHistory = (history ?? [])
    .filter((r) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (r.question ?? "").toLowerCase().includes(q) || r.spreadName.toLowerCase().includes(q) || (r.category ?? "").toLowerCase().includes(q);
    })
    .sort((a, b) => sortOrder === "newest" ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt));

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
            ? "Every full reading and saved chart interpretation you complete is kept here and synced to your account, so your journal follows you across devices. Daily cards are saved here as a one-line entry, not a full reading."
            : "Every full reading and saved chart interpretation you complete is kept here on this device. Sign in to sync your journal across devices. Daily cards are saved here as a one-line entry, not a full reading."}
        </p>
        {/* Phase 3 (3.5): plain device-only warning for guests. Guest
            entries live in this browser's storage; clearing browser
            data deletes them. Signed-in entries are synced, so the
            warning is guest-only. */}
        {!user && (
          <p className="mx-auto mt-3 max-w-xl text-sm text-goldbright/90">
            Guest entries live only on this device and browser. If you
            clear your browser data, they are gone. Sign in to keep
            them.
          </p>
        )}
      </div>

      {history === null && hydrated && (
        <p className="py-16 text-center text-mist">Loading your journal…</p>
      )}

      {((history === null && !hydrated) || (history !== null && history.length === 0)) && (
        <div className="mx-auto mt-12 max-w-md rounded-3xl border border-gold/20 bg-panel/60 p-8 text-center">
          <p className="flex items-center justify-center gap-2 font-display text-2xl text-cream"><Icon name="iconoirBook" size={24} />No readings yet</p>
          <p className="mt-2 text-sm text-cream/75">
            Your first Quick Insight reading is free. Cast the lots and begin.
          </p>
          {/* Phase E (item 8): one writing prompt on the empty journal,
              so the blank page asks something instead of only waiting. */}
          <p className="mt-4 text-sm italic text-goldbright">
            To begin: what question has been following you around this week?
          </p>
          <Link
            href="/spreads/quick-insight"
            className="btn-gold mt-6 inline-block rounded-xl px-8 py-3 font-bold"
          >
            Start my free reading
          </Link>
          {!user && (
            <p className="mt-4 text-sm text-cream/75">
              Already have readings?{" "}
              <Link href="/account" className="font-semibold text-goldbright underline">
                Sign in to sync
              </Link>
            </p>
          )}
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
              <div className="num mt-10 rounded-3xl border border-gold/20 bg-panel/60 p-5 sm:p-6">
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

          {/* Phase 5 (5.1): Pattern Mirror dashboard, computed 100%
              locally from the seeker's own journal entries. No AI,
              no invented data: every count comes from the readings
              above, and fewer than 3 readings shows an honest empty
              state instead of a thin pattern. */}
          {(() => {
            const mirror = patternMirror(history, (cardId) => {
              try {
                const c = getCard(cardId);
                return { arcana: c.arcana, suit: c.suit };
              } catch {
                return null;
              }
            });
            const cardName = (cardId: string) => {
              try {
                return getCard(cardId).name;
              } catch {
                return cardId;
              }
            };
            const elementOf: Record<string, string> = {
              wands: "Fire",
              cups: "Water",
              swords: "Air",
              pentacles: "Earth",
            };
            return (
              <section
                aria-label="Pattern Mirror"
                className="num mt-10 rounded-3xl border border-gold/20 bg-panel/60 p-5 sm:p-6"
              >
                <p className="text-xs uppercase tracking-[0.25em] text-gold">
                  Pattern Mirror
                </p>
                {/* AF-050: no repeat, no pattern. The section shows
                    the honest empty state until some card is drawn
                    more than once (mostDrawn already excludes x1). */}
                {history.length < PATTERN_MIRROR_MIN_READINGS ||
                mirror.mostDrawn.length === 0 ? (
                  <p className="mt-2 text-sm text-cream/75">
                    No patterns yet — your first few readings will appear
                    here once a card starts repeating.
                  </p>
                ) : (
                  <>
                    {mirror.mostDrawn.length > 0 && (
                      <div className="mt-3">
                        <p className="text-sm font-semibold text-cream">
                          Most-drawn cards
                        </p>
                        <ul className="mt-1 space-y-1 text-sm text-cream/85">
                          {mirror.mostDrawn.map((c) => (
                            <li key={c.cardId}>
                              {cardName(c.cardId)} · ×{c.count}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {mirror.totalDraws > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-semibold text-cream">
                          Suit and element balance
                        </p>
                        <ul className="mt-1 space-y-1 text-sm text-cream/85">
                          {mirror.suitBalance.map((s) => (
                            <li key={s.suit} className="capitalize">
                              {s.suit} ({elementOf[s.suit]}) · ×{s.count}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-1 text-sm text-cream/75">
                          Major Arcana ×{mirror.majors} · Minor Arcana ×
                          {mirror.minors}
                        </p>
                      </div>
                    )}
                    {mirror.stalkers.length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-semibold text-cream">
                          Cards that keep reappearing
                        </p>
                        <p className="mt-1 text-sm text-cream/75">
                          Drawn 3 or more times across your journal — a
                          card that keeps showing up, not a verdict.
                        </p>
                        <ul className="mt-1 space-y-1 text-sm text-cream/85">
                          {mirror.stalkers.map((c) => (
                            <li key={c.cardId}>
                              {cardName(c.cardId)} · ×{c.count}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {mirror.revisitCandidate && (
                      <div className="mt-4 rounded-2xl border border-gold/20 bg-panel/40 p-4">
                        <p className="text-sm font-semibold text-cream">
                          From about a week ago
                        </p>
                        <p className="mt-1 text-sm text-cream/75">
                          {mirror.revisitCandidate.spreadName}
                          {mirror.revisitCandidate.question
                            ? ` · “${mirror.revisitCandidate.question}”`
                            : ""}{" "}
                          — cast{" "}
                          {new Date(
                            mirror.revisitCandidate.createdAt
                          ).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                          . Worth a re-read now that a week has passed.
                        </p>
                        {/* Phase E (item 8): one writing prompt on the
                            revisit candidate. */}
                        <p className="mt-2 text-sm italic text-goldbright">
                          What actually happened since this reading?
                        </p>
                        <Link
                          href={`/reading/${mirror.revisitCandidate.id}`}
                          className="mt-2 inline-block text-sm font-semibold text-goldbright underline"
                        >
                          Re-read it
                        </Link>
                      </div>
                    )}
                  </>
                )}
                <p className="mt-3 text-xs text-mist">
                  Computed from your own readings only. Never paywalled.
                </p>
              </section>
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
              <SpotlightCard className="mt-10 rounded-3xl border border-gold/20 bg-panel/60 p-5 sm:p-6">
                <p className="text-xs uppercase tracking-[0.25em] text-gold">
                  Questions you keep returning to
                </p>
                <p className="mt-2 text-sm text-cream/75">
                  Asked more than once. Open the latest to continue it.
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
              </SpotlightCard>
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
                        {/* Phase E (item 8): one writing prompt per
                            revisit candidate. */}
                        <span className="mt-1 block text-xs italic text-goldbright">
                          What actually happened since this reading?
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
            <p className="mt-6 text-center text-sm text-danger">
              {deleteError}
            </p>
          )}

          {/* Deep UX Batch B: search and sort controls for the timeline. */}
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <label htmlFor="journal-search" className="mb-1.5 block text-sm font-medium text-cream">Search your journal</label>
              <input
                id="journal-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by question, spread, or category"
                className="w-full rounded-xl border border-gold/25 bg-panel px-4 py-2.5 text-cream placeholder:text-mist"
              />
            </div>
            <div>
              <label htmlFor="journal-sort" className="mb-1.5 block text-sm font-medium text-cream">Sort</label>
              <select
                id="journal-sort"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
                className="w-full rounded-xl border border-gold/25 bg-panel px-4 py-2.5 text-cream sm:w-auto"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                const md = buildJournalMarkdown(history, (cardId) => {
                  try {
                    return getCard(cardId).name;
                  } catch {
                    return cardId;
                  }
                });
                const blob = new Blob([md], { type: "text/markdown" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `sortes-journal-${new Date().toISOString().slice(0, 10)}.md`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="btn-ghost rounded-xl px-4 py-3 text-sm font-semibold"
            >
              Export journal as Markdown
            </button>
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `sortes-journal-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="btn-ghost rounded-xl px-4 py-3 text-sm font-semibold"
            >
              Export journal as JSON
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="btn-ghost rounded-xl px-4 py-3 text-sm font-semibold"
            >
              Print / save as PDF
            </button>
          </div>
          {/* Codex re-review, correct: with a blank search this
              message asked users to clear a search they never made,
              on an empty or still-loading journal. Only show it
              when a real search filters everything out. */}
          {filteredHistory.length === 0 && search.trim() !== "" && (
            <p className="mt-8 text-center text-sm text-mist">No readings match that search. Try a different word, or clear the search.</p>
          )}

          {/* AF-017: print-to-PDF. Hidden on screen; window.print()
              shows only this sheet (see .journal-print-sheet in
              globals.css). Real text from the same data as the
              Markdown export, so the saved PDF is selectable. */}
          <div className="journal-print-sheet">
            <h1 className="heirloom-title">Sortes journal</h1>
            <hr className="heirloom-rule" />
            {groupReadingsByDay(filteredHistory).map((group) => (
              <section key={group.label} className="heirloom-section">
                <h2 className="heirloom-heading">{group.label}</h2>
                {group.readings.map((r) => (
                  <p key={r.id} className="heirloom-body">
                    {r.spreadName}
                    {r.question ? ` · “${r.question}”` : ""}
                    {r.cards?.length
                      ? `\n${r.cards
                          .map((d) => `${getCard(d.cardId).name}${d.reversed ? " (reversed)" : ""}`)
                          .join(", ")}`
                      : ""}
                    {r.interpretation ? `\n${r.interpretation}` : ""}
                  </p>
                ))}
              </section>
            ))}
          </div>

          {/* M2.2: timeline, grouped by day, in the chosen sort order. */}
          <div className="mt-10 space-y-8">
            {groupReadingsByDay(filteredHistory).map((group) => (
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
                                alt={`${getCard(d.cardId).name}${d.reversed ? ", reversed" : ""}`}
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
                            <p className="mt-1 truncate text-sm italic text-cream/75">
                              “{r.question}”
                            </p>
                          )}
                          {r.chartSummary && (
                            <p className="mt-1 text-sm text-cream/75">{r.chartSummary}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Link
                            href={`/reading/${r.id}`}
                            className="btn-ghost rounded-xl px-4 py-3 text-sm font-semibold"
                          >
                            Open reading
                          </Link>
                          {r.aiGenerated &&
                            r.interpretation &&
                            !r.chartSummary && (
                              <Link
                                href={`/reading/${r.id}`}
                                className="btn-gold rounded-xl px-4 py-3 text-sm font-bold"
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
                            className="rounded-xl border border-danger/30 px-4 py-2.5 text-sm font-semibold text-danger"
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
