"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getReading, updateReading as updateLocalReading } from "@/lib/storage";
import type { Reading, FollowUp } from "@/lib/types";
import { useAuth } from "@/components/AuthProvider";
import { getCard, orientationKeywords, orientationMeaning } from "@/lib/cards";
import TarotCard from "@/components/TarotCard";
import CardModal from "@/components/CardModal";
import ShareReading from "@/components/ShareReading";
import TypewriterText from "@/components/TypewriterText";

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

  // M2.2: 7-day revisit note state
  const [revisitInput, setRevisitInput] = useState("");
  const [revisitSaved, setRevisitSaved] = useState(false);
  const [revisitSaving, setRevisitSaving] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setReading(getReading(id) ?? null));
  }, [id]);

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
      <p className="text-center text-xs uppercase tracking-[0.35em] text-gold">
        {reading.spreadName} · {date}
      </p>
      <h1 className="mt-3 text-center font-display text-5xl text-goldbright">
        Your reading
      </h1>
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
              className="rounded-3xl border border-gold/20 bg-panel/60 p-6"
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
              <p className="mt-3 leading-relaxed text-cream/90">
                {reading.aiGenerated && reading.interpretation
                  ? null
                  : orientationMeaning(card, d.reversed)}
              </p>
            </section>
          );
        })}

        {reading.aiGenerated && reading.interpretation && (
          <section className="rounded-3xl border border-gold/30 bg-navydeep/70 p-6 sm:p-8">
            <p className="text-xs uppercase tracking-[0.25em] text-gold">
              Personalized interpretation
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
                    onClick={async () => {
                      const q = followUpQ.trim();
                      if (!q) return;
                      setFollowUpLoading(true);
                      setFollowUpError(null);

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
                          setFollowUpError(
                            data.error || "Something went wrong. Please try again."
                          );
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
                          "Could not reach the server. Please try again."
                        );
                      } finally {
                        setFollowUpLoading(false);
                      }
                    }}
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
