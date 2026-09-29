"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { getSpread, drawCards } from "@/lib/tarot";
import { getCard } from "@/lib/cards";
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

type Step = "category" | "form" | "confirm" | "processing";

const PROCESSING_LINES = [
  "Casting the lots…",
  "Reading your story…",
  "Weaving the cards together…",
  "Almost there…",
];

export default function IntakeFlow({ slug }: { slug: string }) {
  const router = useRouter();
  const spread = useMemo(() => getSpread(slug), [slug]);
  const { credits, spend, add, persistReading } = useAuth();
  const [step, setStep] = useState<Step>("category");
  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [story, setStory] = useState("");
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [processingLine, setProcessingLine] = useState(0);

  const category = categoryKey ? getCategory(categoryKey) : null;

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

  const beginProcessing = async () => {
    if (!category) return;
    if ((credits ?? 0) < 1) {
      setError("You are out of credits. Please top up to continue.");
      return;
    }
    const ok = await spend(1);
    if (!ok) {
      setError("You are out of credits. Please top up to continue.");
      return;
    }
    trackReadingStarted(`${spread.slug}-personalized`);
    setStep("processing");
    setError(null);

    const lineTimer = setInterval(
      () => setProcessingLine((l) => (l + 1) % PROCESSING_LINES.length),
      2600
    );

    try {
      const cards = drawCards(spread);

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

      if (!res.ok) throw new Error(`Generation failed (${res.status})`);
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
        firstName,
        free: false,
      });
      await persistReading(reading);
      setCachedInterpretation(reading.id, interpretation);
      trackReadingCompleted(`${spread.slug}-personalized`, true);
      clearInterval(lineTimer);
      router.push(`/reading/${reading.id}`);
    } catch (e) {
      clearInterval(lineTimer);
      setStep("confirm");
      setError(
        "The reading could not be generated just now. Your credit was not spent. Please try again in a moment."
      );
      // Refund the credit since nothing was generated.
      await add(1);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <StepDots step={step} />

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
              Tell your story in your own words. Only your first name is ever
              shared with the AI; birthdays stay on your device, and your raw
              answers are deleted after 30 days.
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
                      className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist/50 focus:border-gold/60 focus:outline-none"
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
                      className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist/50 focus:border-gold/60 focus:outline-none"
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
                  className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist/50 focus:border-gold/60 focus:outline-none"
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
                  className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist/50 focus:border-gold/60 focus:outline-none"
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
                onClick={() => setStep("confirm")}
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
                  <dd className="mt-1 font-display text-xl text-cream">{spread.name} · {spread.cards} {spread.cards === 1 ? "card" : "cards"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.2em] text-mist">Area</dt>
                  <dd className="mt-1 text-cream">{category.name}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.2em] text-mist">Your question</dt>
                  <dd className="mt-1 italic text-cream">“{question}”</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.2em] text-mist">Cost</dt>
                  <dd className="mt-1 text-cream">1 credit · personalized AI interpretation</dd>
                </div>
              </dl>
              <div className="rule-gold my-6" />
              <ul className="space-y-2 text-xs leading-relaxed text-mist">
                <li>Only your first name and story essentials are sent to the AI.</li>
                <li>Birthdays and other sensitive details never leave your device.</li>
                <li>Your raw answers are deleted after 30 days.</li>
                <li>Readings are for reflection, never guaranteed predictions.</li>
              </ul>
            </div>

            {error && (
              <p className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">
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
                onClick={beginProcessing}
                className="btn-gold flex-1 rounded-xl px-6 py-3.5 text-lg font-bold"
              >
                ✦ Continue · begin reading
              </button>
            </div>
          </motion.div>
        )}

        {step === "processing" && (
          <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex min-h-[55vh] flex-col items-center justify-center text-center"
            aria-live="polite"
          >
            <motion.div
              animate={{ scale: [1, 1.25, 1], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="flex h-36 w-36 items-center justify-center rounded-full border border-gold/50 bg-gold/10"
            >
              <span className="font-display text-6xl text-gold">✦</span>
            </motion.div>
            <AnimatePresence mode="wait">
              <motion.p
                key={processingLine}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mt-10 font-display text-3xl italic text-goldbright"
              >
                {PROCESSING_LINES[processingLine]}
              </motion.p>
            </AnimatePresence>
            <p className="mt-4 max-w-sm text-sm text-mist">
              Breathe slowly. Your cards are being drawn and your story woven
              into their meanings. This usually takes a few seconds.
            </p>
          </motion.div>
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
          <span className={`text-xs ${i <= current ? "text-goldbright" : "text-mist"}`}>
            {labels[i]}
          </span>
          {i < order.length - 1 && <div className="mx-1 h-px w-6 bg-gold/30" />}
        </div>
      ))}
    </div>
  );
}
