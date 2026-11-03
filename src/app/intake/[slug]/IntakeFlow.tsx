"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import ReadingWait, { PROCESSING_LINES } from "@/components/ReadingWait";
import { getSpread, drawCards } from "@/lib/tarot";
import { getCard } from "@/lib/cards";
import { suggestQuestionRewrite } from "@/lib/question-rewrite";
import type { DrawnCard } from "@/lib/types";
import {
  INTAKE_CATEGORIES,
  getCategory,
  SENSITIVE_KEYS,
  type IntakePayload,
} from "@/lib/intake";
import {
  makeReading,
  setCachedInterpretation,
} from "@/lib/storage";
import { useAuth } from "@/components/AuthProvider";
import { trackReadingStarted, trackReadingCompleted } from "@/components/Analytics";

type Step = "category" | "form" | "confirm" | "impression" | "processing";

export default function IntakeFlow({ slug }: { slug: string }) {
  const router = useRouter();
  const spread = useMemo(() => getSpread(slug), [slug]);
  const { credits, spend, add, persistReading, user, refresh } = useAuth();
  const [step, setStep] = useState<Step>("category");
  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [story, setStory] = useState("");
  const [question, setQuestion] = useState("");
  // M1.1: the question as first written, snapshotted when leaving the
  // form step, so a confirm-step rewrite stays visible as a change.
  const [originalQuestion, setOriginalQuestion] = useState("");
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  // M1.1: cards are drawn at the confirm step and shown for a first
  // impression before any generation or spending happens.
  const [drawnCards, setDrawnCards] = useState<DrawnCard[] | null>(null);
  const [impression, setImpression] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [processingLine, setProcessingLine] = useState(0);
  const [processingComplete, setProcessingComplete] = useState(false);
  const [busy, setBusy] = useState(false);

  const category = categoryKey ? getCategory(categoryKey) : null;

  // M1.1: rule-based rewrite suggestion for the confirm step. Editing
  // the question re-arms the suggestion; using it clears it (the
  // suggestion for an already-open question is null).
  const questionSuggestion = useMemo(
    () => suggestQuestionRewrite(question),
    [question]
  );

  const set = (key: string, value: string) =>
    setAnswers((a) => ({ ...a, [key]: value }));

  const firstName =
    answers.yourName?.trim() ||
    answers.firstName?.trim() ||
    "friend";

  const formValid = () => {
    if (!category) return false;
    for (const f of category.fields) {
      if (f.required && !answers[f.key]?.trim()) return false;
    }
    return story.trim().length > 0 && question.trim().length > 0;
  };

  // M1.1: drawing is free and separate from generation. The confirm
  // step draws the cards and shows them for a first impression; nothing
  // is spent until the seeker taps "Reveal my reading". Going back and
  // continuing again simply draws fresh cards.
  const beginDraw = () => {
    if (!category) return;
    if ((credits ?? 0) < 1) {
      setError("You are out of Oracles. Please top up to continue.");
      return;
    }
    setError(null);
    setDrawnCards(drawCards(spread));
    setStep("impression");
  };

  const beginGeneration = async () => {
    if (!category || !drawnCards) return;
    // Guard against double-clicks: one tap, one credit.
    if (busy) return;
    if ((credits ?? 0) < 1) {
      setError("You are out of Oracles. Please top up to continue.");
      return;
    }
    setBusy(true);
    setProcessingLine(0);
    setProcessingComplete(false);
    // M0.1 credit authority: signed-in users no longer spend client-side.
    // The route spends server-side only after a real model generates
    // text, so a failed generation can never cost a credit. Guests keep
    // the device-local wallet and its pre-spend plus catch refund.
    const signedIn = !!user;
    if (!signedIn) {
      const ok = await spend(1);
      if (!ok) {
        setError("You are out of Oracles. Please top up to continue.");
        setBusy(false);
        return;
      }
    }
    trackReadingStarted(`${spread.slug}-personalized`);
    setStep("processing");
    setError(null);

    const lineTimer = setInterval(
      () => setProcessingLine((line) => Math.min(line + 1, PROCESSING_LINES.length - 1)),
      2600
    );

    let failMessage =
      "The reading could not be generated just now. Your Oracle was not spent. Please try again in a moment.";
    try {
      const cards = drawnCards;
      // One word only: the first token of whatever was typed.
      const firstWord = impression.trim().split(/\s+/)[0] ?? "";

      // Strip sensitive fields (birthdays) before anything leaves the device.
      const safeAnswers: Record<string, string> = {};
      for (const [k, v] of Object.entries(answers)) {
        if (!SENSITIVE_KEYS.includes(k)) safeAnswers[k] = v;
      }

      const payload: IntakePayload = {
        category: category.key,
        categoryName: category.name,
        firstName,
        answers: safeAnswers,
        story: story.trim(),
        question: question.trim(),
        firstImpression: firstWord || undefined,
      };

      const res = await fetch("/api/reading/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadSlug: spread.slug,
          cards: cards.map((c) => ({
            cardId: c.cardId,
            reversed: c.reversed,
            position: c.position,
            positionKey: c.positionKey,
            name: getCard(c.cardId).name,
          })),
          intake: payload,
        }),
      });

      if (!res.ok) {
        // 402 means the server-side spend found no credit; surface the
        // server message so the user is told to top up, not to retry.
        if (res.status === 402) {
          const d = await res.json().catch(() => null);
          if (d?.error) failMessage = d.error;
        }
        throw new Error(`Generation failed (${res.status})`);
      }
      const data = await res.json();
      const interpretation: string = data.interpretation;

      const reading = makeReading({
        spreadSlug: spread.slug,
        spreadName: `${spread.name} · ${category.name}`,
        cards,
        interpretation,
        aiGenerated: true,
        category: category.name,
        question: question.trim(),
        // M1.1: keep the first-written question when the confirm step
        // changed it, and the seeker's own first-impression word.
        originalQuestion:
          originalQuestion && originalQuestion !== question.trim()
            ? originalQuestion
            : undefined,
        firstImpression: firstWord || undefined,
        firstName,
        free: false,
      });
      await persistReading(reading);
      setCachedInterpretation(reading.id, interpretation);
      // Signed-in balance now comes from the server (the route spent
      // after generation); sync it so the header shows the new balance.
      if (signedIn) await refresh();
      trackReadingCompleted(`${spread.slug}-personalized`, true);
      clearInterval(lineTimer);
      setProcessingComplete(true);
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      router.push(`/reading/${reading.id}`);
    } catch {
      clearInterval(lineTimer);
      // Back to the impression step: the cards stay drawn, so the
      // seeker can retry without paying again or re-drawing.
      setStep("impression");
      setError(failMessage);
      // Guest refund only: guests pre-spent from the device wallet, so
      // a failed generation returns it. Signed-in users spent nothing
      // client-side (the route spends only after success), so no
      // refund call here, and the balance endpoint no longer accepts
      // positive client grants at all.
      if (!signedIn) await add(1);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      {/* The impression step is part of the reading phase in the dots. */}
      <StepDots step={step === "impression" ? "processing" : step} />

      <AnimatePresence mode="wait">
        {step === "category" && (
          <motion.div
            key="category"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="text-center"
          >
            <p className="text-xs uppercase tracking-[0.35em] text-gold">
              Step 1 of 3
            </p>
            <h1 className="mt-3 font-display text-4xl text-goldbright sm:text-5xl">
              What is on your mind?
            </h1>
            <p className="mx-auto mt-3 max-w-md text-cream/75">
              Choose the area of life you want clarity on. Your reading will
              be woven around your own story.
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
          </motion.div>
        )}

        {step === "form" && category && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            <p className="text-center text-xs uppercase tracking-[0.35em] text-gold">
              Step 2 of 3
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
                  placeholder="e.g. Should I take the new role or stay where I am?"
                  className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none"
                />
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
                className="btn-gold flex-1 rounded-xl px-6 py-3.5 font-bold disabled:cursor-not-allowed disabled:opacity-40"
              >
                Review my reading
              </button>
            </div>
          </motion.div>
        )}

        {step === "confirm" && category && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="text-center"
          >
            <p className="text-xs uppercase tracking-[0.35em] text-gold">
              Step 3 of 3
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
                  <dd className="mt-1 text-cream">1 Oracle · personalized AI interpretation</dd>
                </div>
              </dl>
              <div className="rule-gold my-6" />
              <ul className="space-y-2 text-xs leading-relaxed text-mist">
                <li>Only your first name and story essentials are sent to the AI.</li>
                <li>Birthdays and other sensitive details never leave your device.</li>
                <li>Your story is not saved; your question, first name, and category are saved in your journal until you delete them.</li>
                <li>Readings are for reflection, never guaranteed predictions.</li>
              </ul>
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
                  A suggestion from a fixed rule, not from AI. It frames
                  your question as reflection instead of a verdict. You
                  can edit it freely.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setQuestion(questionSuggestion)}
                    className="btn-gold rounded-xl px-4 py-2 text-sm font-bold"
                  >
                    Use suggestion
                  </button>
                  <button
                    type="button"
                    onClick={() => setSuggestionDismissed(true)}
                    className="btn-ghost rounded-xl px-4 py-2 text-sm font-semibold"
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
                className="btn-gold flex-1 rounded-xl px-6 py-3.5 text-lg font-bold disabled:cursor-wait disabled:opacity-60"
              >
                ✦ Continue · draw the cards
              </button>
            </div>
          </motion.div>
        )}

        {step === "impression" && drawnCards && category && (
          <motion.div
            key="impression"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="text-center"
          >
            <p className="text-xs uppercase tracking-[0.35em] text-gold">
              Your cards are drawn
            </p>
            <h1 className="mt-3 font-display text-4xl text-goldbright sm:text-5xl">
              First, what do you see?
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm text-cream/75">
              Before the reading is written, give one word for your first
              reaction to these cards. It is optional, and it travels
              with the reading.
            </p>

            <ul className="mx-auto mt-8 max-w-md space-y-2 text-left">
              {drawnCards.map((d) => (
                <li
                  key={d.positionKey}
                  className="rounded-2xl border border-gold/25 bg-panel/60 px-4 py-3 text-sm text-cream"
                >
                  <span className="text-xs uppercase tracking-[0.2em] text-mist">
                    {d.position} ·{" "}
                  </span>
                  {getCard(d.cardId).name}
                  <span className="text-mist">
                    {" "}
                    · {d.reversed ? "reversed" : "upright"}
                  </span>
                </li>
              ))}
            </ul>

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

            <div className="mx-auto mt-8 flex max-w-md gap-3">
              <button
                type="button"
                onClick={() => setStep("confirm")}
                className="btn-ghost rounded-xl px-6 py-3.5 font-semibold"
              >
                Back
              </button>
              <button
                type="button"
                onClick={beginGeneration}
                disabled={busy}
                className="btn-gold flex-1 rounded-xl px-6 py-3.5 text-lg font-bold disabled:cursor-wait disabled:opacity-60"
              >
                {busy ? "✦ Casting…" : "✦ Reveal my reading"}
              </button>
            </div>
          </motion.div>
        )}

        {step === "processing" && (
          <div
            key="processing"
            className="flex min-h-[55vh] flex-col items-center justify-center text-center"
          >
            <ReadingWait
              activeStep={processingLine}
              complete={processingComplete}
            />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StepDots({ step }: { step: Step }) {
  const order: Step[] = ["category", "form", "confirm", "processing"];
  const labels = ["Area", "Story", "Confirm", "Reading"];
  const current = order.indexOf(step);
  return (
    <div className="mb-8 flex items-center justify-center gap-2" aria-hidden="true">
      {order.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
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
