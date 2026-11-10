"use client";

import Link from "next/link";
import type { Reading, FollowUp } from "@/lib/types";
import { getCard, orientationKeywords, orientationMeaning } from "@/lib/cards";
import { computeSpreadFacts } from "@/lib/spread-facts";
import TarotCard from "@/components/TarotCard";
import CardModal from "@/components/CardModal";
import HeirloomPrint from "@/components/HeirloomPrint";
import ReadingText from "@/components/ReadingText";
import { readingToPlainText } from "@/lib/readingMarkdown";
import SplitText from "@/components/SplitText";
import SwipeToast from "@/components/SwipeToast";
import Breadcrumbs from "@/components/Breadcrumbs";
import AnimatedContent from "@/components/AnimatedContent";
import type { FollowUpState, ReadingField } from "./useReadingDetail";

/** Breadcrumbs, spread + date line, title, question lines. */
export function ReadingHeader({ reading }: { reading: Reading }) {
  const date = new Date(reading.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return (
    <>
      {/* Phase F: a saved reading lives in the Journal; this is the way back. */}
      <Breadcrumbs
        trail={[
          { href: "/", label: "Home" },
          { href: "/journal", label: "Journal" },
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
    </>
  );
}

/** Guest-only prompt to sign in and keep the reading. */
export function GuestKeepNotice() {
  return (
    <section className="mx-auto mt-6 max-w-xl rounded-2xl border border-gold/40 bg-panel/70 p-5 text-center">
      <h2 className="font-display text-xl text-goldbright">Keep this reading</h2>
      <p className="mt-2 text-sm text-cream/80">
        Right now this reading lives only on this device. Sign in to save it to your account, so it stays in your Journal and future readings are kept there too.
      </p>
      <Link
        href="/account"
        className="mt-4 inline-block rounded-full bg-gold px-5 py-3 text-sm font-semibold text-ink hover:bg-goldbright"
      >
        Sign in to save this reading
      </Link>
    </section>
  );
}

/**
 * Personal Phase 1: at a glance, computed from this draw only.
 * No AI, no invented story: dominant suit and tension pair are
 * deterministic facts about the cards drawn, shown here so the
 * reading starts from your question and your cards, not from
 * generic card meanings.
 */
export function AtAGlance({ reading }: { reading: Reading }) {
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
    <AnimatedContent trigger="scroll" wipe="up" blur={10} distance={60} duration={0.8} scale={0.98} threshold={0.2}>
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
              The flavour running through your question, not a verdict on it.
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
    </AnimatedContent>
  );
}

/** The drawn cards row, tap-to-enlarge hint, and the zoom modal. */
export function CardRow({
  reading,
  zoomCard,
  setZoomCard,
}: {
  reading: Reading;
  zoomCard: string | null;
  setZoomCard: (id: string | null) => void;
}) {
  return (
    <>
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
    </>
  );
}

/** Per-card meanings and the personalized interpretation. */
export function CardMeanings({ reading }: { reading: Reading }) {
  return (
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
          <p className="mt-1 text-xs text-mist">
            AI-generated
          </p>
          <ReadingText
            text={reading.interpretation}
            className="mt-3 whitespace-pre-line leading-relaxed text-cream/90"
          />
          <p className="mt-4 text-xs italic text-mist">
            Written for you in this moment.
          </p>
        </section>
      )}
    </div>
  );
}

/** M1.1: the one next step the seeker chooses after reading. */
export function NextStepPanel({ field }: { field: ReadingField }) {
  return (
    <div className="mx-auto mt-10 max-w-3xl rounded-3xl border border-gold/25 bg-panel/60 p-6 text-left sm:p-8">
      <p className="text-xs uppercase tracking-[0.25em] text-gold">
        My next step
      </p>
      <p className="mt-2 text-sm leading-relaxed text-cream/85">
        One small step from this reading, saved with it and shown in your Journal.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={field.input}
          onChange={(e) => field.onChange(e.target.value)}
          placeholder="e.g. Message her before the weekend"
          maxLength={300}
          aria-label="My next step"
          className="w-full flex-1 rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none"
        />
        <button
          type="button"
          disabled={field.saving || !field.input.trim()}
          onClick={() => field.save((value) => ({ nextStep: value }))}
          className="btn-gold rounded-xl px-6 py-3 font-bold disabled:opacity-100 disabled:saturate-50"
        >
          {field.saving ? "Saving…" : "Save step"}
        </button>
      </div>
      {/* AF-049: a disabled Save says why, inline. */}
      {!field.input.trim() && (
        <p className="mt-2 text-xs text-mist">
          Write your step first — the button works once there is text to save.
        </p>
      )}
      {field.saved && (
        <p className="mt-2 text-sm text-goldbright">Saved with this reading.</p>
      )}
    </div>
  );
}

/**
 * Phase E (item 8): a general note on the reading, free text,
 * editable, separate from the revisit note.
 */
export function NotePanel({ reading, field }: { reading: Reading; field: ReadingField }) {
  return (
    <div className="mx-auto mt-10 max-w-3xl rounded-3xl border border-gold/25 bg-panel/60 p-6 text-left sm:p-8">
      <p className="text-xs uppercase tracking-[0.25em] text-gold">
        Your note
      </p>
      <p className="mt-2 text-sm leading-relaxed text-cream/85">
        Anything you want to remember about this reading, in your own words. Saved with it and shown in your Journal.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <textarea
          value={field.input}
          onChange={(e) => field.onChange(e.target.value)}
          placeholder="e.g. This landed the day I decided to apply"
          maxLength={1000}
          rows={3}
          aria-label="Note on this reading"
          className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none"
        />
        <button
          type="button"
          disabled={field.saving || !field.input.trim()}
          onClick={() => field.save((value) => ({ note: value }))}
          className="btn-gold self-start rounded-xl px-6 py-3 font-bold disabled:opacity-100 disabled:saturate-50"
        >
          {field.saving ? "Saving…" : reading.note ? "Update note" : "Save note"}
        </button>
      </div>
      {/* AF-049: a disabled Save says why, inline. */}
      {!field.input.trim() && (
        <p className="mt-2 text-xs text-mist">
          Write your note first — the button works once there is text to save.
        </p>
      )}
      {field.saved && (
        <p className="mt-2 text-sm text-goldbright">Saved with this reading.</p>
      )}
    </div>
  );
}

/**
 * M2.2: 7-day revisit. Shown once a week has passed and no note
 * exists yet, or to display a saved note. Never shown early.
 */
export function RevisitPanel({ reading, field }: { reading: Reading; field: ReadingField }) {
  const parsed = Date.parse(reading.createdAt);
  // Phase 4C lint: Date.now() is the current day here, floored
  // to whole days, so re-renders within the same day are stable
  // and the 7-day gate only flips at a midnight boundary, which
  // a re-render legitimately reflects. There is no prop or state
  // to derive this from; the render-time read is the correct
  // place, so the purity rule is disabled for this line.
  const ageDays = Number.isNaN(parsed)
    ? 0
    // eslint-disable-next-line react-hooks/purity
    : Math.floor((Date.now() - parsed) / 86400000);
  const saveRevisit = () =>
    field.save((value) => ({
      revisitNote: value,
      revisitAt: new Date().toISOString(),
    }));
  if (reading.revisitNote) {
    return (
      <div className="mx-auto mt-10 max-w-3xl rounded-3xl border border-gold/25 bg-panel/60 p-6 text-left sm:p-8">
        <p className="text-xs uppercase tracking-[0.25em] text-gold">
          What you noted on revisit
        </p>
        {/* Phase E (item 8): the revisit note is editable after
            saving, like the next step. The prefilled form is
            the same one used to write it the first time. */}
        <div className="mt-4 flex flex-col gap-3">
          <textarea
            value={field.input}
            onChange={(e) => field.onChange(e.target.value)}
            placeholder="e.g. I took the step, and the reply came faster than I feared"
            maxLength={1000}
            rows={3}
            aria-label="Revisit note"
            className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none"
          />
          <button
            type="button"
            disabled={field.saving || !field.input.trim()}
            onClick={saveRevisit}
            className="btn-gold self-start rounded-xl px-6 py-3 font-bold disabled:opacity-100 disabled:saturate-50"
          >
            {field.saving ? "Saving…" : "Update revisit note"}
          </button>
        </div>
        {/* AF-049: a disabled Save says why, inline. */}
        {!field.input.trim() && (
          <p className="mt-2 text-xs text-mist">
            Write your revisit note first — the button works once there is text to save.
          </p>
        )}
        {field.saved && (
          <p className="mt-2 text-sm text-goldbright">
            Saved with this reading.
          </p>
        )}
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
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <textarea
          value={field.input}
          onChange={(e) => field.onChange(e.target.value)}
          placeholder="e.g. I took the step, and the reply came faster than I feared"
          maxLength={1000}
          rows={3}
          aria-label="Revisit note"
          className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none"
        />
        <button
          type="button"
          disabled={field.saving || !field.input.trim()}
          onClick={saveRevisit}
          className="btn-gold self-start rounded-xl px-6 py-3 font-bold disabled:opacity-100 disabled:saturate-50"
        >
          {field.saving ? "Saving…" : "Save revisit note"}
        </button>
      </div>
      {/* AF-049: a disabled Save says why, inline. */}
      {!field.input.trim() && (
        <p className="mt-2 text-xs text-mist">
          Write your revisit note first — the button works once there is text to save.
        </p>
      )}
      {field.saved && (
        <p className="mt-2 text-sm text-goldbright">
          Saved with this reading.
        </p>
      )}
    </div>
  );
}

/**
 * Phase 5 (5.4a): heirloom keepsake export (print-to-PDF).
 * Only this reading's real content: question, cards,
 * interpretation, step, follow-ups, revisit note.
 */
export function ReadingHeirloom({ reading }: { reading: Reading }) {
  return (
    <HeirloomPrint
      title={reading.spreadName}
      subtitle={reading.question}
      date={reading.createdAt}
      sections={[
        {
          heading: "Cards drawn",
          body: reading.cards
            .map((d) => {
              try {
                return `${d.position}: ${getCard(d.cardId).name}${d.reversed ? " (reversed)" : ""}`;
              } catch {
                return `${d.position}: ${d.cardId}`;
              }
            })
            .join("\n"),
        },
        { heading: "Interpretation", body: readingToPlainText(reading.interpretation ?? "") },
        { heading: "My next step", body: reading.nextStep ?? "" },
        { heading: "Note", body: reading.note ?? "" },
        {
          heading: "Follow-ups",
          body: (reading.followUps ?? [])
            .map((fu) => `${fu.question}\n${readingToPlainText(fu.answer)}`)
            .join("\n\n"),
        },
        { heading: "Revisit note", body: reading.revisitNote ?? "" },
      ]}
    />
  );
}

/** M2.1: follow-up section (tarot readings with an interpretation only). */
export function FollowUpThread({
  reading,
  isGuest,
  f,
}: {
  reading: Reading;
  isGuest: boolean;
  f: FollowUpState;
}) {
  return (
    <>
      <div className="rule-gold w-24" />
      <p className="font-display text-2xl text-cream">Still turning it over?</p>
      <p className="max-w-md text-sm text-cream/75">
        Each follow-up draws one fresh clarifier card from the
        cards not already in this spread, and the answer reads
        it alongside your original cards.
      </p>

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
              {/* Phase 5 (5.3): the clarifier card drawn for this
                  follow-up, from the cards not already in the
                  spread. Older follow-ups (pre-Phase 5) have
                  none, so the line is conditional. */}
              {fu.clarifierCardId && (
                <p className="mt-2 text-sm text-goldbright">
                  Clarifier card:{" "}
                  {(() => {
                    try {
                      return getCard(fu.clarifierCardId).name;
                    } catch {
                      return fu.clarifierCardId;
                    }
                  })()}{" "}
                  <span className="text-xs text-mist">
                    — drawn fresh for this follow-up
                  </span>
                </p>
              )}
              <ReadingText text={fu.answer} className="mt-2 text-sm leading-relaxed text-cream/90" />
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
              value={f.followUpQ}
              onChange={(e) => {
                f.setFollowUpQ(e.target.value);
                f.setFollowUpError(null);
              }}
              placeholder="Ask a follow-up about this reading..."
              maxLength={300}
              aria-label="Follow-up question"
              className="w-full flex-1 rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none"
            />
            <button
              type="button"
              disabled={f.followUpLoading || !f.followUpQ.trim()}
              onClick={f.askFollowUp}
              className="btn-gold whitespace-nowrap rounded-xl px-6 py-3 font-bold disabled:opacity-100 disabled:saturate-50"
            >
              {f.followUpLoading
                ? "Writing your follow-up…"
                : isGuest
                  ? "Sign in to ask a follow-up"
                  : (reading.followUps ?? []).length === 0
                  ? "Ask a follow-up · free"
                  : "Ask a follow-up · 1 Oracle"}
            </button>
          </div>
          {/* AF-049: a disabled Ask says why, inline. */}
          {!f.followUpQ.trim() && !f.followUpLoading && (
            <p className="text-xs text-mist">
              Write your question first — the button works once there is a question to ask.
            </p>
          )}
          {f.followUpError && (
            <p className="text-sm text-danger">{f.followUpError}</p>
          )}
          {/* Phase E (item 7): the chosen next step is sent with
              the follow-up question, so the answer can build on
              it; and a guest thread lives only on this device. */}
          <p className="text-xs text-mist">
            Your chosen next step, if you saved one above, is sent along with your follow-up question.
          </p>
          {f.followUpFailed && (
            <div className="space-y-3">
              <SwipeToast
                open={f.followUpToastOpen}
                onClose={() => f.setFollowUpToastOpen(false)}
                title="Follow-up failed"
                actionLabel="Retry"
                onAction={f.askFollowUp}
                inline
                closeButton
                width={320}
                background="#1a1f2e"
                color="#ede6d6"
                fuseColor="#d4af37"
              />
              <button
                type="button"
                onClick={f.askFollowUp}
                disabled={f.followUpLoading}
                className="w-full rounded-xl border border-gold/40 px-4 py-3 text-sm font-semibold text-goldbright hover:bg-gold/15 disabled:opacity-100 disabled:saturate-50"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Non-tarot or no-interpretation: this is not a follow-up
 * thread (the route rejects non-AI readings), so the button
 * says plainly what it does: a new reading. Phase E (item 7):
 * free readings are AI readings, so their real follow-up
 * thread is the section above; only this branch is relabeled.
 */
export function NewReadingPrompt() {
  return (
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
        Start a new reading &middot; 1 Oracle
      </Link>
    </>
  );
}
