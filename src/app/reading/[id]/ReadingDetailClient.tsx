"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getReading, updateReading as updateLocalReading } from "@/lib/storage";
import type { Reading, FollowUp } from "@/lib/types";
import { useAuth } from "@/components/AuthProvider";
import { getCard, orientationKeywords, orientationMeaning } from "@/lib/cards";
import { computeSpreadFacts } from "@/lib/spread-facts";
import TarotCard from "@/components/TarotCard";
import CardModal from "@/components/CardModal";
import ShareReading from "@/components/ShareReading";
import TypewriterText from "@/components/TypewriterText";
import SplitText from "@/components/SplitText";
import SwipeToast from "@/components/SwipeToast";
import Breadcrumbs from "@/components/Breadcrumbs";
import FadeContent from "@/components/FadeContent";

/**
 * Reading detail: full cards + interpretation + share + "Ask a follow-up" upsell.
 */
export default function ReadingDetail({ id }: { id: string }) {
  const [reading, setReading] = useState<Reading | null | undefined>(undefined);
  const [zoomCard, setZoomCard] = useState<string | null>(null);
  // M1.1: the one next step the seeker chooses after reading. Kept in
  // local state for editing, saved onto the reading on Save.
  const { updateReading, user, spend, add, refresh } = useAuth();
  const [nextStepInput, setNextStepInput] = useState("");
  const [nextStepSaved, setNextStepSaved] = useState(false);
  const [nextStepSaving, setNextStepSaving] = useState(false);

  // M2.1: follow-up thread state
  const [followUpQ, setFollowUpQ] = useState("");
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  // Phase D: followUpFailed marks a genuine call failure (not a
  // balance stop) and drives the persistent retry UI; the toast flag
  // drives the transient toast on top of it.
  const [followUpFailed, setFollowUpFailed] = useState(false);
  const [followUpToastOpen, setFollowUpToastOpen] = useState(false);

  // Phase D: extracted from the Ask button so the plain retry
  // button and the toast action can run the same call.
  const askFollowUp = async () => {
    const q = followUpQ.trim();
    if (!q) return;
    if (!reading) return;
    setFollowUpLoading(true);
    setFollowUpError(null);
    // Phase D: a new attempt clears the previous failure UI.
    setFollowUpFailed(false);
    setFollowUpToastOpen(false);

    const existingCount = (reading.followUps ?? []).length;
    const isFree = existingCount === 0;

    // Guest pre-spend for non-free follow-ups (M0.1 pattern).
    let guestPreSpent = false;
    if (!user && !isFree) {
      const ok = await spend(1);
      if (!ok) {
        setFollowUpError("You need 1 Oracle for this follow-up.");
        setFollowUpLoading(false);
        return;
      }
      guestPreSpent = true;
    }

    try {
      const payload: Record<string, unknown> = { question: q };
      if (user) {
        payload.readingId = reading.id;
      } else {
        // Guest: send whitelisted reading fields
        payload.reading = {
          question: reading.question,
          interpretation: reading.interpretation,
          aiGenerated: reading.aiGenerated,
          cards: reading.cards.map((c) => ({
            cardId: c.cardId,
            position: c.position,
            name: getCard(c.cardId)?.name,
          })),
          category: reading.category,
          firstImpression: reading.firstImpression,
          nextStep: reading.nextStep,
          followUps: reading.followUps,
        };
      }

      const res = await fetch("/api/reading/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        // Refund guest pre-spend on failure
        if (guestPreSpent) await add(1);
        // Phase D: every failure message states that no Oracle was
        // spent (the route spends only after success; guests are
        // refunded above), but only a genuine call failure gets the
        // toast and retry UI. A 402 is a balance stop.
        const msg = data.error || "Something went wrong. Please try again.";
        setFollowUpError(msg.includes("spent") ? msg : `${msg} No Oracle was spent.`);
        if (res.status !== 402) {
          setFollowUpFailed(true);
          setFollowUpToastOpen(true);
        }
        setFollowUpLoading(false);
        return;
      }

      // Update local reading with returned followUps.
      // Do NOT rely on the PATCH path: the follow-up route
      // already updated the server copy for signed-in users,
      // and updateReading only PATCHes nextStep anyway.
      if (data.followUps) {
        const updated = updateLocalReading(reading.id, {
          followUps: data.followUps,
        });
        if (updated) setReading(updated);
      }

      // Sync credits display for signed-in users: the
      // route already spent server-side, so refresh the
      // balance from the server.
      if (user && typeof data.credits === "number") {
        await refresh();
      }

      setFollowUpQ("");
    } catch {
      if (guestPreSpent) await add(1);
      setFollowUpError(
        "Could not reach the server. Please try again. No Oracle was spent."
      );
      setFollowUpFailed(true);
      setFollowUpToastOpen(true);
    } finally {
      setFollowUpLoading(false);
    }
  };

  // M2.2: 7-day revisit note state
  const [revisitInput, setRevisitInput] = useState("");
  const [revisitSaved, setRevisitSaved] = useState(false);
  const [revisitSaving, setRevisitSaving] = useState(false);

  // Codex fresh review on PR 51, correct: ReturnLoop can now link a
  // server-only reading, but this page read local storage only and
  // showed "Reading not found" on a new device. Fall back to the
  // server history (full reading objects) when no local copy exists.
  useEffect(() => {
    const local = getReading(id);
    if (local) {
      setReading(local);
      return;
    }
    if (!user) {
      setReading(null);
      return;
    }
    let cancelled = false;
    fetch("/api/history")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const found = (d.readings ?? []).find((r: { id: string }) => r.id === id);
        setReading((found as Reading) ?? null);
      })
      .catch(() => {
        if (!cancelled) setReading(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id, user]);

  // Prefill the step input from the saved step once the reading loads,
  // so clearing the field actually clears it instead of falling back.
  useEffect(() => {
    if (reading) setNextStepInput(reading.nextStep ?? "");
  }, [reading?.id]);

  // Same prefill rule for the revisit note.
  useEffect(() => {
    if (reading) setRevisitInput(reading.revisitNote ?? "");
  }, [reading?.id]);

  if (reading === undefined) {
    return <p className="py-20 text-center text-mist">Loading…</p>;
  }

  if (reading === null) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="font-display text-4xl text-goldbright">Reading not found</h1>
        <p className="mt-4 text-cream/75">
          This reading is not in your journal on this device.
        </p>
        <Link href="/spreads" className="btn-gold mt-8 inline-block rounded-xl px-8 py-3 font-bold">
          Begin a new reading
        </Link>
      </div>
    );
  }

  const date = new Date(reading.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      {/* Phase F: a saved reading lives in the Journal; this is the way back. */}
      <Breadcrumbs
        trail={[
          { href: "/", label: "Home" },
          { href: "/history", label: "Journal" },
          { label: reading.spreadName },
        ]}
      />
      <p className="num text-center text-xs uppercase tracking-[0.35em] text-gold">
        {reading.spreadName} · {date}
      </p>
      <SplitText tag="h1" text="Your reading" className="mt-3 text-center font-display text-5xl text-goldbright" />
      {reading.question && (
        <p className="mx-auto mt-4 max-w-xl text-center italic text-cream/80">
          “{reading.question}”
        </p>
      )}
      {reading.originalQuestion && (
        <p className="mx-auto mt-2 max-w-xl text-center text-xs text-mist">
          First written as: “{reading.originalQuestion}”
        </p>
      )}
      {reading.firstImpression && (
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-goldbright">
          Your first impression: {reading.firstImpression}
        </p>
      )}

      {/* Personal Phase 1: at a glance, computed from this draw only.
          No AI, no invented story: dominant suit and tension pair are
          deterministic facts about the cards drawn, shown here so the
          reading starts from your question and your cards, not from
          generic card meanings. */}
      {(() => {
        // Codex review on PR 45, correct: chart readings are stored
        // with cards [] and a chartSummary, so this tarot-specific
        // card would report 0 cards and a story that was never used.
        // It renders for tarot readings only.
        if (reading.chartSummary || reading.cards.length === 0) return null;
        const facts = computeSpreadFacts(
          reading.cards.map((d) => {
            const c = getCard(d.cardId);
            return {
              cardId: d.cardId,
              name: c.name,
              reversed: d.reversed,
              position: d.position,
              arcana: c.arcana,
              suit: c.suit,
              number: c.number,
            };
          })
        );
        return (
          <FadeContent trigger="scroll">
          <section className="mx-auto mt-8 max-w-3xl rounded-3xl border border-gold/25 bg-panel/60 p-6 text-left sm:p-8">
            <p className="text-xs uppercase tracking-[0.25em] text-gold">
              About this reading, at a glance
            </p>
            <dl className="mt-3 space-y-2 text-sm leading-relaxed text-cream/85">
              {reading.category && (
                <div className="flex gap-2">
                  <dt className="shrink-0 font-semibold text-cream">Area:</dt>
                  <dd>{reading.category}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="shrink-0 font-semibold text-cream">Cards drawn:</dt>
                <dd className="num">
                  {reading.cards.length} ·{" "}
                  {facts.reversalCount > 0
                    ? `${facts.reversalCount} reversed`
                    : "none reversed"}
                </dd>
              </div>
              {facts.dominantSuit && facts.dominantElement && facts.dominantCount >= 2 && (
                <div className="flex gap-2">
                  <dt className="shrink-0 font-semibold text-cream">Strongest thread:</dt>
                  <dd>
                    {facts.dominantSuit} ({facts.dominantElement}),{" "}
                    <span className="num">{facts.dominantCount}</span> of{" "}
                    <span className="num">{reading.cards.length}</span> cards.
                    Read this as the flavour running through your question,
                    not a verdict on it.
                  </dd>
                </div>
              )}
              {facts.tensionPair && (
                <div className="flex gap-2">
                  <dt className="shrink-0 font-semibold text-cream">Tension to sit with:</dt>
                  <dd>
                    {facts.tensionPair.a} ({facts.tensionPair.aElement}) pulls
                    against {facts.tensionPair.b} ({facts.tensionPair.bElement}).
                  </dd>
                </div>
              )}
            </dl>
            <p className="mt-3 text-xs text-mist">
              These lines come from the cards drawn for your question. Your
              story was used for this reading only and is not saved here.
            </p>
          </section>
          </FadeContent>
        );
      })()}

      <div className="mt-8 flex flex-wrap justify-center gap-4">
        {reading.cards.map((d) => (
          <TarotCard
            key={d.positionKey}
            cardId={d.cardId}
            reversed={d.reversed}
            revealed
            size="sm"
            label={d.position}
            onFlip={() => setZoomCard(d.cardId)}
          />
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-mist">
        Tap any card to enlarge it.
      </p>

      {zoomCard && (
        <CardModal cardId={zoomCard} onClose={() => setZoomCard(null)} />
      )}

      <div className="mx-auto mt-10 max-w-3xl space-y-5">
        {reading.cards.map((d, i) => {
          const card = getCard(d.cardId);
          return (
            <section
              key={d.positionKey}
              className="rounded-3xl border border-gold/20 bg-panel/60 p-6 sm:p-8"
            >
              <p className="text-xs uppercase tracking-[0.25em] text-gold">
                {i + 1} · {d.position}
              </p>
              <h2 className="mt-1 font-display text-2xl text-cream">
                {card.name}{" "}
                <span className="text-sm font-body font-normal text-mist">
                  {d.reversed ? "reversed" : "upright"}
                </span>
              </h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {orientationKeywords(card, d.reversed).map((k) => (
                  <span
                    key={k}
                    className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs text-goldbright"
                  >
                    {k}
                  </span>
                ))}
              </div>
              {reading.aiGenerated && reading.interpretation ? (
                <details className="mt-3 rounded-xl border border-gold/20 bg-panel/40 px-4 py-3">
                  <summary className="cursor-pointer text-sm font-semibold text-goldbright">
                    Traditional meaning, if you want it
                  </summary>
                  <p className="mt-2 leading-relaxed text-cream/90">
                    {orientationMeaning(card, d.reversed)}
                  </p>
                </details>
              ) : (
                <p className="mt-3 leading-relaxed text-cream/90">
                  {orientationMeaning(card, d.reversed)}
                </p>
              )}
            </section>
          );
        })}

        {reading.aiGenerated && reading.interpretation && (
          <section className="rounded-3xl border border-gold/30 bg-navydeep/70 p-6 sm:p-8">
            <p className="text-xs uppercase tracking-[0.25em] text-gold">
              Personalized interpretation
            </p>
            <p className="mt-2 text-sm leading-relaxed text-cream/75">
              Written for your question above. The closing part answers, in
              order: what stands out, the tension or opportunity, what you
              may be overlooking, and one practical step. Read it as
              reflection, not a prediction.
            </p>
            <TypewriterText
              text={reading.interpretation}
              className="mt-3 whitespace-pre-line leading-relaxed text-cream/90"
            />
            <p className="mt-4 text-xs italic text-mist">
              Written for you in this moment. Tap the text to reveal it all at once.
            </p>
          </section>
        )}
      </div>

      <p className="mx-auto mt-10 max-w-3xl text-center text-sm text-mist">
        Want the astrology side of this question?{" "}
        <Link href="/charts" className="font-semibold text-goldbright underline underline-offset-4">
          Cast a birth chart for it
        </Link>
      </p>

      <div className="mx-auto mt-10 max-w-3xl rounded-3xl border border-gold/25 bg-panel/60 p-6 text-left sm:p-8">
        <p className="text-xs uppercase tracking-[0.25em] text-gold">
          My next step
        </p>
        <p className="mt-2 text-sm leading-relaxed text-cream/85">
          One small step you choose from this reading. It is saved with
          the reading, so your journal can remind you of it later.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={nextStepInput}
            onChange={(e) => {
              setNextStepInput(e.target.value);
              setNextStepSaved(false);
            }}
            placeholder="e.g. Message her before the weekend"
            maxLength={300}
            aria-label="My next step"
            className="w-full flex-1 rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none"
          />
          <button
            type="button"
            disabled={nextStepSaving || !nextStepInput.trim()}
            onClick={async () => {
              const value = nextStepInput.trim();
              if (!value) return;
              setNextStepSaving(true);
              const updated = await updateReading(reading.id, { nextStep: value });
              setNextStepSaving(false);
              if (updated) {
                setReading(updated);
                setNextStepSaved(true);
              }
            }}
            className="btn-gold rounded-xl px-6 py-3 font-bold disabled:opacity-40"
          >
            {nextStepSaving ? "Saving…" : "Save step"}
          </button>
        </div>
        {nextStepSaved && (
          <p className="mt-2 text-sm text-goldbright">Saved with this reading.</p>
        )}
      </div>

      {/* M2.2: 7-day revisit. Shown once a week has passed and no note
          exists yet, or to display a saved note. Never shown early. */}
      {(() => {
        const parsed = Date.parse(reading.createdAt);
        const ageDays = Number.isNaN(parsed)
          ? 0
          : Math.floor((Date.now() - parsed) / 86400000);
        if (reading.revisitNote) {
          return (
            <div className="mx-auto mt-10 max-w-3xl rounded-3xl border border-gold/25 bg-panel/60 p-6 text-left sm:p-8">
              <p className="text-xs uppercase tracking-[0.25em] text-gold">
                What you noted on revisit
              </p>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-cream/90">
                {reading.revisitNote}
              </p>
              {reading.revisitAt && (
                <p className="mt-2 text-xs text-mist">
                  Noted{" "}
                  {new Date(reading.revisitAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              )}
            </div>
          );
        }
        if (ageDays < 7) return null;
        return (
          <div className="mx-auto mt-10 max-w-3xl rounded-3xl border border-gold/25 bg-panel/60 p-6 text-left sm:p-8">
            <p className="text-xs uppercase tracking-[0.25em] text-gold">
              A week has passed
            </p>
            <p className="mt-2 text-sm leading-relaxed text-cream/85">
              What has shifted since this reading? A line or two is enough.
              It is saved with the reading, so your journal keeps the whole
              arc, not just the first day.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <textarea
                value={revisitInput}
                onChange={(e) => {
                  setRevisitInput(e.target.value);
                  setRevisitSaved(false);
                }}
                placeholder="e.g. I took the step, and the reply came faster than I feared"
                maxLength={1000}
                rows={3}
                aria-label="Revisit note"
                className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none"
              />
              <button
                type="button"
                disabled={revisitSaving || !revisitInput.trim()}
                onClick={async () => {
                  const value = revisitInput.trim();
                  if (!value) return;
                  setRevisitSaving(true);
                  const updated = await updateReading(reading.id, {
                    revisitNote: value,
                    revisitAt: new Date().toISOString(),
                  });
                  setRevisitSaving(false);
                  if (updated) {
                    setReading(updated);
                    setRevisitSaved(true);
                  }
                }}
                className="btn-gold self-start rounded-xl px-6 py-3 font-bold disabled:opacity-40"
              >
                {revisitSaving ? "Saving…" : "Save revisit note"}
              </button>
            </div>
            {revisitSaved && (
              <p className="mt-2 text-sm text-goldbright">
                Saved with this reading.
              </p>
            )}
          </div>
        );
      })()}

      <div className="mx-auto mt-10 flex max-w-3xl flex-col items-center gap-4 rounded-3xl border border-gold/25 bg-panel/60 p-6 text-center sm:p-8">
        <ShareReading
          spreadName={reading.spreadName}
          drawn={reading.cards}
          date={reading.createdAt}
        />

        {/* M2.1: follow-up section (tarot readings with an interpretation only) */}
        {reading.aiGenerated && reading.interpretation && !reading.chartSummary && (
          <>
            <div className="rule-gold w-24" />
            <p className="font-display text-2xl text-cream">Still turning it over?</p>

            {/* Existing follow-ups, oldest first */}
            {(reading.followUps ?? []).length > 0 && (
              <div className="w-full space-y-4 text-left">
                {(reading.followUps ?? []).map((fu: FollowUp, i: number) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-gold/20 bg-panel/50 p-4"
                  >
                    <p className="text-xs uppercase tracking-[0.2em] text-gold">
                      Follow-up {i + 1}{fu.free ? " (free)" : " (1 Oracle)"}
                    </p>
                    <p className="mt-1 text-sm italic text-cream/80">
                      &ldquo;{fu.question}&rdquo;
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-cream/90">
                      {fu.answer}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Follow-up input or thread-complete notice */}
            {(reading.followUps ?? []).length >= 3 ? (
              <p className="text-sm text-mist">
                This thread is complete. You have used all 3 follow-ups for
                this reading.
              </p>
            ) : (
              <div className="w-full space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    value={followUpQ}
                    onChange={(e) => {
                      setFollowUpQ(e.target.value);
                      setFollowUpError(null);
                    }}
                    placeholder="Ask a follow-up about this reading..."
                    maxLength={300}
                    aria-label="Follow-up question"
                    className="w-full flex-1 rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={followUpLoading || !followUpQ.trim()}
                    onClick={askFollowUp}
                    className="btn-gold whitespace-nowrap rounded-xl px-6 py-3 font-bold disabled:opacity-40"
                  >
                    {followUpLoading
                      ? "Writing your follow-up…"
                      : (reading.followUps ?? []).length === 0
                        ? "Ask a follow-up \u00b7 free"
                        : "Ask a follow-up \u00b7 1 Oracle"}
                  </button>
                </div>
                {followUpError && (
                  <p className="text-sm text-red-400">{followUpError}</p>
                )}
                {followUpFailed && (
                  <div className="space-y-3">
                    <SwipeToast
                      open={followUpToastOpen}
                      onClose={() => setFollowUpToastOpen(false)}
                      title="Follow-up failed"
                      actionLabel="Retry"
                      onAction={askFollowUp}
                      inline
                      closeButton
                      width={320}
                      background="#1a1f2e"
                      color="#ede6d6"
                      fuseColor="#d4af37"
                    />
                    <button
                      type="button"
                      onClick={askFollowUp}
                      disabled={followUpLoading}
                      className="w-full rounded-xl border border-gold/40 px-4 py-3 text-sm font-semibold text-goldbright hover:bg-gold/15 disabled:opacity-50"
                    >
                      Try again
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Non-tarot or no-interpretation: show the old new-reading link */}
        {!(reading.aiGenerated && reading.interpretation && !reading.chartSummary) && (
          <>
            <div className="rule-gold w-24" />
            <p className="font-display text-2xl text-cream">Still turning it over?</p>
            <p className="max-w-md text-sm text-cream/75">
              Start a new clarifying reading on the same question. It draws
              fresh cards; your previous reading stays in your history.
            </p>
            <Link
              href="/spreads/quick-insight"
              className="btn-gold rounded-xl px-8 py-3 font-bold"
            >
              Ask a follow-up &middot; 1 Oracle
            </Link>
          </>
        )}
      </div>

      <p className="mx-auto mt-8 max-w-md text-center text-xs italic leading-relaxed text-mist">
        For reflection and perspective, not guaranteed predictions.
      </p>
    </div>
  );
}
