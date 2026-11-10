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
  getIntakeDraft,
  saveIntakeDraft,
  clearIntakeDraft,
} from "@/lib/storage";
import { intakeGate } from "@/lib/intake-gate";
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
  const { credits, persistReading, user, loading: authLoading, refresh } = useAuth();
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
  // Batch D (A3): generation needs sign-in unless this is a guest's free
  // Quick Insight. The gate shows BEFORE the category and story steps, so a
  // guest never writes a story they cannot submit. While the session is
  // still loading we wait (a signed-in seeker must not see the gate flash).
  // `signInNeeded` also turns on after a server 401 (a free use the server
  // already counted, or an expired session).
  const [serverSignInNeeded, setServerSignInNeeded] = useState(false);
  const gate = intakeGate({
    signedIn: !!user,
    isFreeAvailable,
    authLoading,
    serverSignInNeeded,
  });

  const category = categoryKey ? getCategory(categoryKey) : null;

  // Batch D (A3): keep the typed draft on this device so a seeker who leaves
  // to sign in (/account is a full navigation) comes back to it. Restored
  // once on mount, saved as they type, cleared after a successful generation.
  // Birth-sensitive answers are never stored.
  const [draftReady, setDraftReady] = useState(false);
  useEffect(() => {
    queueMicrotask(() => {
      const d = getIntakeDraft(slug);
      if (d && d.categoryKey && getCategory(d.categoryKey)) {
        setCategoryKey(d.categoryKey);
        setAnswers(d.answers);
        setStory(d.story);
        setQuestion(d.question);
        setStep("form");
      }
      setDraftReady(true);
    });
  }, [slug]);
  useEffect(() => {
    if (!draftReady || !categoryKey) return;
    const safe: Record<string, string> = {};
    for (const [k, v] of Object.entries(answers)) if (!SENSITIVE_KEYS.includes(k)) safe[k] = v;
    saveIntakeDraft({ slug, categoryKey, answers: safe, story, question });
  }, [draftReady, slug, categoryKey, answers, story, question]);

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
    // M0.1 credit authority: the client never spends. The route spends
    // server-side only after a real model generates text, so a failed
    // generation can never cost a credit and no refund is needed. A guest
    // can only reach this point for a free Quick Insight (the gate above
    // blocks every other guest path), which spends nothing.
    const signedIn = !!user;
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
          if (res.status === 401) setServerSignInNeeded(true);
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
      clearIntakeDraft();
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
    setToastOpen, isFreeAvailable, gate, credits, category, questionSuggestion, set, formValid,
    beginDraw, beginGeneration, retryGeneration,
  };
}

export type IntakeState = ReturnType<typeof useIntakeFlow>;
