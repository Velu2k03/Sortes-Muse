"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PROCESSING_LINES } from "@/components/ReadingWait";
import { getSpread, drawCards } from "@/lib/tarot";
import { getCard } from "@/lib/cards";
import { suggestQuestionRewrite } from "@/lib/question-rewrite";
import type { DrawnCard, Reading } from "@/lib/types";
import { getCategory, SENSITIVE_KEYS, type IntakePayload } from "@/lib/intake";
import {
  makeReading,
  setCachedInterpretation,
  freeReadingUsed,
  markFreeReadingUsed,
} from "@/lib/storage";
import { useAuth } from "@/components/AuthProvider";
import { trackReadingStarted, trackReadingCompleted } from "@/components/Analytics";

export type Step = "category" | "form" | "confirm" | "impression" | "processing";

/**
 * F30 (2026-11-09): all IntakeFlow state and actions, moved verbatim
 * out of the component so IntakeFlow.tsx is a thin shell.
 */
export function useIntakeFlow(slug: string) {
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
  // Phase D: generationFailed marks a genuine call failure (not a
  // balance or validation stop) and drives the persistent retry UI;
  // toastOpen drives the transient toast on top of it.
  const [generationFailed, setGenerationFailed] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  // Phase 2, 2.1: the first Quick Insight is free per device (FAQ
  // rule). Read the device flag on mount; it gates the credit checks
  // below and is marked only after a successful generation, never
  // before, so a failed attempt never burns the free reading.
  const [usedFree, setUsedFree] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setUsedFree(freeReadingUsed()));
  }, []);
  const isFreeAvailable = spread.slug === "quick-insight" && !usedFree;

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
    if (!isFreeAvailable && (credits ?? 0) < 1) {
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
    if (!isFreeAvailable && (credits ?? 0) < 1) {
      setError("You are out of Oracles. Please top up to continue.");
      return;
    }
    setBusy(true);
    setProcessingLine(0);
    setProcessingComplete(false);
    // Phase D: a new attempt clears the previous failure UI, whatever
    // path this attempt ends on.
    setGenerationFailed(false);
    setToastOpen(false);
    // M0.1 credit authority: signed-in users no longer spend client-side.
    // The route spends server-side only after a real model generates
    // text, so a failed generation can never cost a credit. Guests keep
    // the device-local wallet and its pre-spend plus catch refund.
    // A first free Quick Insight skips the pre-spend entirely: the
    // route checks the server record for signed-in users and the
    // device flag (claimFree) for guests.
    const signedIn = !!user;
    if (!signedIn && !isFreeAvailable) {
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
    let was402 = false;
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
          originalQuestion: originalQuestion || undefined,
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
        if (res.status === 402 || res.status === 401) {
          was402 = true;
          const d = await res.json().catch(() => null);
          if (d?.error) failMessage = d.error;
        }
        throw new Error(`Generation failed (${res.status})`);
      }
      const data = await res.json();
      const interpretation: string = data.interpretation;
      // The free reading is consumed only now, on a real generated
      // reading. The server marks its own record for signed-in users;
      // the device flag is the guest record.
      if (isFreeAvailable) {
        markFreeReadingUsed();
        setUsedFree(true);
      }

      // Signed-in: the server already saved this row with the spend.
      const reading: Reading = data.reading ?? makeReading({
        spreadSlug: spread.slug,
        spreadName: `${spread.name} · ${category.name}`,
        cards,
        interpretation,
        aiGenerated: true,
        // Phase E (item 2): keep the serving model the API returned,
        // so the reading page can label it instead of discarding it.
        model: typeof data.model === "string" && data.model ? data.model : undefined,
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
        free: isFreeAvailable,
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
    } catch (err) {
      clearInterval(lineTimer);
      // Back to the impression step: the cards stay drawn, so the
      // seeker can retry without paying again or re-drawing.
      setStep("impression");
      setError(failMessage);
      // Phase D: only a genuine call failure gets the toast and the
      // persistent retry UI. A 402 is a balance stop, told to top up,
      // not to retry the same call.
      if (!was402) {
        setGenerationFailed(true);
        setToastOpen(true);
      }
      // Guest refund only: guests pre-spent from the device wallet, so
      // a failed generation returns it. Signed-in users spent nothing
      // client-side (the route spends only after success), so no
      // refund call here, and the balance endpoint no longer accepts
      // positive client grants at all. A free reading pre-spent
      // nothing, so there is nothing to return.
      if (!signedIn && !isFreeAvailable) await add(1);
      setBusy(false);
      // SlideCommit needs the rejection to show its error state; the
      // error message above is already set, so this only signals it.
      throw err;
    }
  };

  // Phase D plain retry: the same generation call as SlideCommit. The
  // rethrow at the end of beginGeneration only signals SlideCommit, so
  // swallow it here; the failure is already surfaced via setError.
  const retryGeneration = () => {
    void beginGeneration().catch(() => {});
  };

  return {
    spread, step, setStep, setCategoryKey, answers, setAnswers, story, setStory,
    question, setQuestion, setOriginalQuestion, suggestionDismissed,
    setSuggestionDismissed, drawnCards, impression, setImpression, error,
    processingLine, processingComplete, busy, generationFailed, toastOpen,
    setToastOpen, isFreeAvailable, category, questionSuggestion, set, formValid,
    beginDraw, beginGeneration, retryGeneration,
  };
}

export type IntakeState = ReturnType<typeof useIntakeFlow>;
