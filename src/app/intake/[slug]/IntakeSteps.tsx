"use client";

import { motion } from "motion/react";
import TarotCard from "@/components/TarotCard";
import SlideCommit from "@/components/SlideCommit";
import SwipeToast from "@/components/SwipeToast";
import { INTAKE_CATEGORIES, getCategory } from "@/lib/intake";
import type { DrawnCard } from "@/lib/types";
import type { IntakeState, Step } from "./useIntakeFlow";

type IntakeCategory = NonNullable<ReturnType<typeof getCategory>>;

/** Step 1: choose the area of life. */
export function CategoryStep({ f }: { f: IntakeState }) {
  const { setStep, setCategoryKey, setAnswers } = f;
  return (
    <>
      <p className="text-xs uppercase tracking-[0.35em] text-gold">
        Step 1 of 4
      </p>
      <h1 className="mt-3 font-display text-4xl text-goldbright sm:text-5xl">
        What is on your mind?
      </h1>
      <p className="mx-auto mt-3 max-w-md text-cream/75">
        Choose the area of life for this reading.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {INTAKE_CATEGORIES.map((c, i) => (
          <motion.button
            key={c.key}
            type="button"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            onClick={() => {
              setCategoryKey(c.key);
              setAnswers({});
              setStep("form");
            }}
            className="rounded-2xl border border-gold/25 bg-panel/60 p-5 text-left transition hover:-translate-y-0.5 hover:border-gold/60"
          >
            <p className="font-display text-xl text-cream">{c.name}</p>
            <p className="mt-1 text-sm italic text-mist">{c.tagline}</p>
          </motion.button>
        ))}
      </div>
    </>
  );
}

/** Step 2: the category's fields, the story, and the question. */
export function FormStep({ f, category }: { f: IntakeState; category: IntakeCategory }) {
  const { setStep, answers, story, setStory, question, setQuestion, setOriginalQuestion, setSuggestionDismissed, set, formValid } = f;
  return (
    <>
      <p className="text-center text-xs uppercase tracking-[0.35em] text-gold">
        Step 2 of 4
      </p>
      <h1 className="mt-3 text-center font-display text-4xl text-goldbright">
        {category.name}
      </h1>
      <p className="mx-auto mt-3 max-w-md text-center text-sm text-cream/75">
        Tell your story in your own words. Your story goes to the AI for
        this reading only and is not saved. Your question, first name,
        and category are saved in your journal: on this device as a
        guest, in your account when signed in, until you delete them.
      </p>

      {category.key === "health" && (
        <div className="mt-6 rounded-2xl border border-violet/40 bg-violet/10 p-4 text-sm leading-relaxed text-cream/85">
          A gentle note: health readings are wellness reflection only.
          They never diagnose or predict medical outcomes and cannot
          replace a licensed professional.
        </div>
      )}

      <div className="mt-8 space-y-5">
        {category.fields.map((f) => (
          <div key={f.key}>
            <label
              htmlFor={`intake-${f.key}`}
              className="mb-1.5 block text-sm font-medium text-cream"
            >
              {f.label}
              {f.required && <span className="text-gold"> *</span>}
            </label>
            {f.type === "textarea" ? (
              <textarea
                id={`intake-${f.key}`}
                value={answers[f.key] ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                rows={3}
                className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none"
              />
            ) : f.type === "select" ? (
              <select
                id={`intake-${f.key}`}
                value={answers[f.key] ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
                className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream focus:border-gold/60 focus:outline-none"
              >
                <option value="">Choose…</option>
                {f.options?.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`intake-${f.key}`}
                type={f.type}
                value={answers[f.key] ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none"
              />
            )}
            {f.hint && <p className="mt-1 text-xs text-mist">{f.hint}</p>}
          </div>
        ))}

        <div>
          <label htmlFor="intake-story" className="mb-1.5 block text-sm font-medium text-cream">
            Your story / background <span className="text-gold">*</span>
          </label>
          <textarea
            id="intake-story"
            value={story}
            onChange={(e) => setStory(e.target.value)}
            placeholder="Share what is happening in your own words, as much or as little as you like…"
            rows={5}
            className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="intake-question" className="mb-1.5 block text-sm font-medium text-cream">
            The one exact question you want clarity on <span className="text-gold">*</span>
          </label>
          <input
            id="intake-question"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={`e.g. ${category.examples[0]}`}
            className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none"
          />
          <p className="mt-2 text-xs text-mist">Ask like this, or tap one to start from it:</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {/* AF-046: chips come from this area's own examples,
                so the Love form never shows a career question. */}
            {category.examples.map((ex) => (
              <button key={ex} type="button" onClick={() => setQuestion(ex)} className="rounded-full border border-gold/30 px-3 py-2.5 min-h-[44px] text-xs text-cream/90 hover:bg-gold/10">
                {ex}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={() => setStep("category")}
          className="btn-ghost rounded-xl px-6 py-3.5 font-semibold"
        >
          Back
        </button>
        <button
          type="button"
          disabled={!formValid()}
          onClick={() => {
            setOriginalQuestion(question);
            setSuggestionDismissed(false);
            setStep("confirm");
          }}
          className="btn-gold flex-1 rounded-xl px-6 py-3.5 font-bold disabled:cursor-not-allowed disabled:opacity-100 disabled:saturate-50"
        >
          Review my reading
        </button>
      </div>
    </>
  );
}

/** Step 3: review, optional rewrite suggestion, then draw. */
export function ConfirmStep({ f, category }: { f: IntakeState; category: IntakeCategory }) {
  const { spread, setStep, question, setQuestion, suggestionDismissed, setSuggestionDismissed, error, isFreeAvailable, questionSuggestion, beginDraw } = f;
  return (
    <>
      <p className="text-xs uppercase tracking-[0.35em] text-gold">
        Step 3 of 4
      </p>
      <h1 className="mt-3 font-display text-4xl text-goldbright sm:text-5xl">
        Ready to cast the lots?
      </h1>

      <div className="mt-8 rounded-3xl border border-gold/25 bg-panel/60 p-6 text-left sm:p-8">
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-[0.2em] text-mist">Spread</dt>
            <dd className="mt-1 font-display text-xl text-cream">{spread.name} · <span className="font-body text-goldbright">{spread.cards}</span> {spread.cards === 1 ? "card" : "cards"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.2em] text-mist">Area</dt>
            <dd className="mt-1 text-cream">{category.name}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.2em] text-mist">Your question</dt>
            <dd className="mt-1">
              <input
                type="text"
                value={question}
                onChange={(e) => {
                  setQuestion(e.target.value);
                  setSuggestionDismissed(false);
                }}
                aria-label="Your question"
                className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base italic text-cream focus:border-gold/60 focus:outline-none"
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.2em] text-mist">Cost</dt>
            <dd className="mt-1 text-cream">
              {isFreeAvailable
                ? "Free · your first Quick Insight, no Oracle needed"
                : "1 Oracle · personalized AI interpretation"}
            </dd>
          </div>
        </dl>
        <div className="rule-gold my-6" />
        <ul className="space-y-2 text-xs leading-relaxed text-mist">
          <li>Only your first name and story essentials are sent to the AI.</li>
          <li>Birthdays and other sensitive details never leave your device.</li>
          <li>Your story is not saved; your question, first name, and category are saved in your journal until you delete them.</li>
          <li>Readings are for reflection, never guaranteed predictions.</li>
        </ul>
        <p className="mt-4 text-sm leading-relaxed text-cream/85">
          What happens next: cards are drawn, you give one word,
          then the reading is written.{" "}
          {isFreeAvailable
            ? "This first Quick Insight is free: nothing is charged, and the free reading is used only once the reading is written. If generation fails, the free reading stays yours to try again."
            : "Nothing has been charged yet: the Oracle is spent when you confirm generation, after your impression, not at the draw. If generation fails while this page is still open, a guest Oracle is returned; a signed-in Oracle is spent only after a reading is written."}
        </p>
      </div>

      {questionSuggestion && !suggestionDismissed && (
        <div className="mt-6 rounded-2xl border border-gold/25 bg-panel/60 p-4 text-left">
          <p className="text-xs uppercase tracking-[0.2em] text-mist">
            Suggested stronger version
          </p>
          <p className="mt-2 text-sm italic text-cream">
            “{questionSuggestion}”
          </p>
          <p className="mt-1 text-xs text-mist">
            A fixed-rule suggestion, not from AI. Edit it freely.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setQuestion(questionSuggestion)}
              className="btn-gold rounded-xl px-4 py-3 text-sm font-bold"
            >
              Use suggestion
            </button>
            <button
              type="button"
              onClick={() => setSuggestionDismissed(true)}
              className="btn-ghost rounded-xl px-4 py-3 text-sm font-semibold"
            >
              Keep mine
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm alert-error-text">
          {error}
        </p>
      )}

      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={() => setStep("form")}
          className="btn-ghost rounded-xl px-6 py-3.5 font-semibold"
        >
          Back
        </button>
        <button
          type="button"
          onClick={beginDraw}
          className="btn-gold flex-1 rounded-xl px-6 py-3.5 text-lg font-bold disabled:cursor-wait disabled:opacity-100 disabled:saturate-50"
        >
          ✦ Continue · draw the cards
        </button>
      </div>
    </>
  );
}

/** The drawn cards, a one-word impression, then generation. */
export function ImpressionStep({ f, drawnCards }: { f: IntakeState; drawnCards: DrawnCard[] }) {
  const { setStep, impression, setImpression, error, busy, generationFailed, toastOpen, setToastOpen, beginGeneration, retryGeneration } = f;
  return (
    <>
      <p className="text-xs uppercase tracking-[0.35em] text-gold">
        Your cards are drawn
      </p>
      <h1 className="mt-3 font-display text-4xl text-goldbright sm:text-5xl">
        First, what do you see?
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-cream/75">
        One word, if you like. It travels with the reading.
      </p>

      {/* Cards, not names only, approved 2026-11-04: the
          impression step used to list card names as text, so
          "what do you see" had nothing to see, and a reversed
          card had no visual cue. Now the drawn faces show,
          reversed cards rotate 180 degrees via TarotCard,
          and the position is the card label. Smaller cards
          for larger spreads so the row fits at 390px. */}
      <div className="mx-auto mt-8 flex max-w-2xl flex-wrap items-start justify-center gap-4 sm:gap-6">
        {drawnCards.map((d) => (
          <TarotCard
            key={d.positionKey}
            cardId={d.cardId}
            reversed={d.reversed}
            revealed
            disabled
            size={drawnCards.length > 3 ? "sm" : "md"}
            label={d.position}
          />
        ))}
      </div>

      <p className="mt-4 text-xs text-mist">
        Reversed cards are shown upside down.
      </p>
      <div className="mx-auto mt-6 max-w-md">
        <label
          htmlFor="intake-impression"
          className="mb-1.5 block text-left text-sm font-medium text-cream"
        >
          One word for your first reaction (optional)
        </label>
        <input
          id="intake-impression"
          type="text"
          value={impression}
          onChange={(e) => setImpression(e.target.value)}
          placeholder="e.g. hopeful"
          maxLength={40}
          className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none"
        />
      </div>

      {error && (
        <p className="mx-auto mt-4 max-w-md rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm alert-error-text">
          {error}
        </p>
      )}

      {generationFailed && (
        <div className="mx-auto mt-4 max-w-md space-y-3">
          <SwipeToast
            open={toastOpen}
            onClose={() => setToastOpen(false)}
            title="Reading failed"
            actionLabel="Retry"
            onAction={retryGeneration}
            inline
            closeButton
            width={320}
            background="#1a1f2e"
            color="#ede6d6"
            fuseColor="#d4af37"
          />
          <button
            type="button"
            onClick={retryGeneration}
            disabled={busy}
            className="w-full rounded-xl border border-gold/40 px-4 py-3 text-sm font-semibold text-goldbright hover:bg-gold/15 disabled:opacity-100 disabled:saturate-50"
          >
            Try again
          </button>
        </div>
      )}

      <div className="mx-auto mt-8 flex max-w-md gap-3">
        <button
          type="button"
          onClick={() => setStep("confirm")}
          className="btn-ghost rounded-xl px-6 py-3.5 font-semibold"
        >
          Back
        </button>
        <div className="flex-1">
          <SlideCommit
            label="✦ Reveal my reading"
            doneLabel="Reading ready"
            errorLabel="Try again"
            onConfirm={beginGeneration}
            disabled={busy}
            width={250}
            trackColor="#1a1f2e"
            handleColor="#d4af37"
            successColor="#d4af37"
            dangerColor="#e57373"
          />
        </div>
      </div>
    </>
  );
}

export function StepDots({ step }: { step: Step }) {
  const order: Step[] = ["category", "form", "confirm", "processing"];
  const labels = ["Area", "Story", "Confirm", "Reading"];
  const current = order.indexOf(step);
  return (
    <div className="mb-8 flex items-center justify-center gap-2" role="list" aria-label="Reading steps">
      {order.map((s, i) => (
        <div key={s} role="listitem" aria-current={i === current ? "step" : undefined} className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold ${
              i <= current
                ? "border-gold bg-gold text-ink"
                : "border-gold/30 text-mist"
            }`}
          >
            {i + 1}
          </div>
          <span className={`hidden text-xs sm:inline ${i <= current ? "text-goldbright" : "text-mist"}`}>
            {labels[i]}
          </span>
          {i < order.length - 1 && <div className="mx-1 h-px w-6 bg-gold/30" />}
        </div>
      ))}
    </div>
  );
}
