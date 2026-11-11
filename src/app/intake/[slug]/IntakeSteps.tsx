"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import ReadingWait from "@/components/ReadingWait";
import ReadingText from "@/components/ReadingText";
import TarotCard from "@/components/TarotCard";
import SlideCommit from "@/components/SlideCommit";
import SwipeToast from "@/components/SwipeToast";
import { INTAKE_CATEGORIES, getCategory } from "@/lib/intake";
import type { DrawnCard } from "@/lib/types";
import type { IntakeState, Step } from "./useIntakeFlow";

type IntakeCategory = NonNullable<ReturnType<typeof getCategory>>;

// Batch 3a (Claude H1): on every step change the user stared at the
// footer, because nothing moved the page or the focus. Each step
// mounts fresh (AnimatePresence mode="wait"), so its mount effect is
// the right moment: scroll its heading to the top (below the sticky
// 64px header) and move focus to it. Reduced motion means an instant
// jump instead of a smooth scroll. The heading is not in the tab
// order (tabIndex -1) and shows no focus ring: the scroll itself
// shows sighted users the move, and screen-reader users get the
// heading announced.
//
// The scroll is conditional (see focusStepElement): on arrival the
// page is already at the top and the heading is in view, so
// scrolling would only hide the breadcrumbs; on a step change after
// the user scrolled down, the heading is off-screen and the scroll
// is the fix. Focus always moves, with preventScroll, so the
// screen-reader cursor lands on the new step.
export type FocusableStepElement = {
  scrollIntoView: (options: ScrollIntoViewOptions) => void;
  focus: (options: FocusOptions) => void;
  getBoundingClientRect: () => { top: number; bottom: number };
};

export function focusStepElement(el: FocusableStepElement, reduce: boolean, viewportHeight: number) {
  const rect = el.getBoundingClientRect();
  // 128px matches the scroll-mt-32 on the targets, so the "Step N
  // of 4" label above a heading also clears the sticky 64px header.
  // The heading sits 20px low at mount (enter animation), so a
  // measured top of 128 means a real top of at least 108.
  const visible = rect.top >= 128 && rect.bottom <= viewportHeight;
  if (!visible) {
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }
  el.focus({ preventScroll: true });
}

export function useStepFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  // useReducedMotion returns boolean | null; null means unknown,
  // which behaves like "not reduced". In this motion version the
  // value is frozen at first render, so reading it through a ref
  // keeps the mount effect from ever re-running.
  const reduce = useReducedMotion() ?? false;
  const reduceRef = useRef(reduce);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    focusStepElement(el, reduceRef.current, window.innerHeight);
  }, []);
  return ref;
}

/**
 * Batch D (A3): shown instead of every step when a guest cannot generate
 * this reading (every spread except a free Quick Insight). It appears
 * before the story form, so nobody writes a story they cannot submit.
 */
export function SignInGate({ f }: { f: IntakeState }) {
  const { spread, credits } = f;
  const hasDeviceOracles = (credits ?? 0) > 0;
  return (
    <section aria-label="Sign in required" className="mt-8 rounded-3xl border border-gold/25 bg-panel/70 p-6 text-center">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Sign in to continue</p>
      <h1 className="mt-3 font-display text-3xl text-goldbright sm:text-4xl">
        {spread.name} needs an account
      </h1>
      <p className="mx-auto mt-3 max-w-md text-cream/80">
        Readings are saved to your account when they are written, so sign in
        first. Your first Quick Insight is the one reading you can take
        without signing in.
      </p>
      {hasDeviceOracles && (
        <p className="mx-auto mt-3 max-w-md text-sm text-cream/80">
          You have {credits} {credits === 1 ? "Oracle" : "Oracles"} on this device. Device
          Oracles can no longer be used for paid readings while signed out. When you
          sign in, they move to your account.
        </p>
      )}
      <Link href={`/account?returnTo=${encodeURIComponent(`/intake/${spread.slug}`)}`} className="btn-gold mt-6 inline-block rounded-xl px-8 py-3.5 font-bold">
        Sign in
      </Link>
      <p className="mt-3 text-xs text-mist">
        Anything you already typed here is kept on this device and waiting when you come back.
      </p>
    </section>
  );
}

/** Step 1: choose the area of life. */
export function CategoryStep({ f }: { f: IntakeState }) {
  const { setStep, setCategoryKey, setAnswers } = f;
  const headingRef = useStepFocus<HTMLHeadingElement>();
  return (
    <>
      <p className="text-xs uppercase tracking-[0.35em] text-gold">
        Step 1 of 4
      </p>
      <h1 ref={headingRef} tabIndex={-1} className="mt-3 scroll-mt-32 font-display text-4xl text-goldbright outline-none sm:text-5xl">
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

/** Step 2: the story (optional) and the question (the only required field). Batch 3b cut the category fields. */
export function FormStep({ f, category }: { f: IntakeState; category: IntakeCategory }) {
  const { setStep, story, setStory, question, setQuestion, setOriginalQuestion, setSuggestionDismissed, formValid } = f;
  const headingRef = useStepFocus<HTMLHeadingElement>();
  return (
    <>
      <p className="text-center text-xs uppercase tracking-[0.35em] text-gold">
        Step 2 of 4
      </p>
      <h1 ref={headingRef} tabIndex={-1} className="mt-3 scroll-mt-32 text-center font-display text-4xl text-goldbright outline-none">
        {category.name}
      </h1>
      <p className="mx-auto mt-3 max-w-md text-center text-sm text-cream/75">
        Tell us what&apos;s going on. Your story goes to the AI for
        this reading only and is not stored. Your question and
        category are saved to your journal.
      </p>

      {category.key === "health" && (
        <div className="mt-6 rounded-2xl border border-violet/40 bg-violet/10 p-4 text-sm leading-relaxed text-cream/85">
          A gentle note: health readings are wellness reflection only.
          They never diagnose or predict medical outcomes and cannot
          replace a licensed professional.
        </div>
      )}

      <div className="mt-4 text-center">
        <button type="button" onClick={f.startOver} className="text-sm text-mist underline underline-offset-4 hover:text-cream">
          Start over
        </button>
        <p className="mt-1 text-xs text-mist">Clears what you typed from this device.</p>
      </div>

      <div className="mt-8 space-y-5">
        <div>
          <label htmlFor="intake-story" className="mb-1.5 block text-sm font-medium text-cream">
            Your story / background <span className="font-normal text-mist">(optional)</span>
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
  const headingRef = useStepFocus<HTMLHeadingElement>();
  return (
    <>
      <p className="text-xs uppercase tracking-[0.35em] text-gold">
        Step 3 of 4
      </p>
      <h1 ref={headingRef} tabIndex={-1} className="mt-3 scroll-mt-32 font-display text-4xl text-goldbright outline-none sm:text-5xl">
        Check and draw
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
        <p className="mt-4 text-sm leading-relaxed text-cream/85">
          Nothing is charged until you reveal your reading. If the
          reading fails, you aren&apos;t charged.
        </p>
        <p className="mt-3 text-xs text-mist">
          How your story is handled:{" "}
          <Link href="/privacy" className="text-goldbright underline underline-offset-4">
            Privacy
          </Link>
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
        <p role="alert" className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm alert-error-text">
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
  const headingRef = useStepFocus<HTMLHeadingElement>();
  return (
    <>
      <p className="text-xs uppercase tracking-[0.35em] text-gold">
        Your cards are drawn
      </p>
      <h1 ref={headingRef} tabIndex={-1} className="mt-3 scroll-mt-32 font-display text-4xl text-goldbright outline-none sm:text-5xl">
        First, what do you see?
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-cream/75">
        One word, if you like. We&apos;ll include it in your reading.
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
        <p role="alert" className="mx-auto mt-4 max-w-md rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm alert-error-text">
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

/** The wait screen, as its own component so it mounts after the
 * previous step exits (AnimatePresence mode="wait") and the focus
 * hook fires at the right moment. An effect in IntakeFlow keyed on
 * `step` cannot do this: it runs while the old step is still
 * exiting, the div is not in the DOM yet, and nothing re-runs it
 * (Batch 3a review B1). The container has aria-live="polite" inside
 * ReadingWait, so focusing it reads the current line once and later
 * line updates announce themselves.
 * Batch 2b (SSE): once the interpretation starts streaming in,
 * the wait screen shows it live (via the static ReadingText, the
 * same renderer as the reading page, so there is no typewriter and
 * no reveal on reopen). Until the first text arrives it shows the
 * rotating status lines. Nothing here claims the reading is saved:
 * the `done` event is the save confirmation, and only then does the
 * flow navigate to the reading page. */
export function ProcessingStage({ activeStep, complete, streamedText }: { activeStep: number; complete: boolean; streamedText: string }) {
  const ref = useStepFocus<HTMLDivElement>();
  return (
    <div ref={ref} tabIndex={-1} aria-label="Creating your reading" className="flex min-h-[55vh] scroll-mt-32 flex-col items-center justify-center text-center outline-none">
      <ReadingWait activeStep={activeStep} complete={complete} />
      {streamedText.length > 0 && (
        <div className="mt-8 w-full text-left">
          <p className="text-xs uppercase tracking-[0.25em] text-gold">Writing your reading</p>
          <div className="mt-3">
            <ReadingText text={streamedText} />
          </div>
        </div>
      )}
    </div>
  );
}

export function StepDots({ step }: { step: Step }) {
  const order: Step[] = ["category", "form", "confirm", "processing"];
  const labels = ["Area", "Story", "Confirm", "Reading"];
  const current = order.indexOf(step);
  return (
    <ul className="mb-8 flex items-center justify-center gap-2" role="list" aria-label="Reading steps">
      {order.map((s, i) => (
        <li key={s} aria-current={i === current ? "step" : undefined} className="flex items-center gap-2">
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
        </li>
      ))}
    </ul>
  );
}
