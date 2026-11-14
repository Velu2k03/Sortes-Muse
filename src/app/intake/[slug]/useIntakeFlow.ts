"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PROCESSING_LINES } from "@/components/ReadingWait";
import { readSse } from "@/lib/sse-client";
import { getSpread, drawCards } from "@/lib/tarot";
import { getCard } from "@/lib/cards";
import { suggestQuestionRewrite } from "@/lib/question-rewrite";
import type { DrawnCard, Reading } from "@/lib/types";
import { getCategory, SENSITIVE_KEYS, type IntakePayload } from "@/lib/intake";
import {
  makeReading,
  pendingAttemptId,
  clearPendingAttemptId,
  setCachedInterpretation,
  freeReadingUsed,
  markFreeReadingUsed,
  getIntakeDraft,
  saveIntakeDraft,
  clearIntakeDraft,
  takeHeroQuestion,
  peekHeroQuestion,
} from "@/lib/storage";
import { unconfirmedMessage, requireSavedReading } from "@/lib/generate-failure";
import { intakeGate } from "@/lib/intake-gate";
import { useAuth, deviceHeldSession } from "@/components/AuthProvider";
import { isFreeAvailableFor } from "@/lib/free-reading";
import { trackReadingStarted, trackReadingCompleted } from "@/components/Analytics";

export type Step = "category" | "form" | "confirm" | "impression" | "processing";

/**
 * F30 (2026-11-09): all IntakeFlow state and actions, moved verbatim
 * out of the component so IntakeFlow.tsx is a thin shell.
 */
export function useIntakeFlow(slug: string) {
  const router = useRouter();
  const spread = useMemo(() => getSpread(slug), [slug]);
  const { credits, persistReading, user, loading: authLoading, refresh, freeReadingAvailable, authFailed, refreshFreeStatus } = useAuth();
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
  // Batch 2b (SSE): the interpretation as it streams in, shown live
  // on the wait screen. The ref accumulates every delta; the state
  // updates throttled (~150 ms) so the wait screen re-renders at most
  // ~7x/s instead of per token. Reset on every new attempt.
  const [streamedText, setStreamedText] = useState("");
  const [streamingModel, setStreamingModel] = useState<string | null>(null);
  const streamRef = useRef("");
  const lastFlushRef = useRef(0);
  const [busy, setBusy] = useState(false);
  // Phase D: generationFailed marks a genuine call failure (not a
  // balance or validation stop) and drives the persistent retry UI;
  // toastOpen drives the transient toast on top of it.
  const [generationFailed, setGenerationFailed] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  // Phase 2, 2.1: the first Quick Insight is free (FAQ rule). Read the
  // device flag on mount; it gates the credit checks below and is marked
  // only after a successful generation, never before, so a failed
  // attempt never burns the free reading.
  // Batch 1 (C1): the device flag is the GUEST record only. For a
  // signed-in user the server record (from /api/auth/me) decides, so a
  // user who already used their account free reading is never shown
  // "Cost: Free" and then charged 1 Oracle.
  const [usedFree, setUsedFree] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setUsedFree(freeReadingUsed()));
  }, []);
  // Re-check fix: the session flag is read in a mount effect, not
  // during render. The server renders without it, so reading it during
  // render would hydrate mismatched ("Free" on the server, "1 Oracle"
  // on the client).
  const [hadSession, setHadSession] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setHadSession(deviceHeldSession()));
  }, []);
  // Re-check 3 (N2): while auth is still loading the state is
  // unknown, so the label fails closed. Without this, a signed-in
  // user with a valid cookie but no session key yet (every existing
  // user on first load after deploy) sees "Free" from the device
  // flag, and the intake gate lets them through without waiting.
  const isFreeAvailable =
    !authLoading &&
    isFreeAvailableFor({
      slug: spread.slug,
      signedIn: !!user,
      serverFree: freeReadingAvailable,
      deviceFree: !usedFree,
      hadSession,
      authFailed,
    });
  // Opus review (non-blocking 3) and re-check: the free status is
  // known when signed in and the server value arrived, or always for
  // guests (the device flag is their record). When it is unknown --
  // signed in with no server value, or not signed in with a prior
  // session or a failed /me -- the credit gates below do not block:
  // the server may grant the free reading, and answers 402 with a
  // clear message if not.
  const freeStatusKnown = user
    ? freeReadingAvailable !== null
    : !(hadSession || authFailed);
  // Batch 1 (C1, review finding 6): re-read the flag when the cost is
  // about to be shown or acted on, so a free reading used in another
  // tab or device does not leave this tab promising "Free" while the
  // server charges. refreshFreeStatus only updates the flag; a failure
  // keeps the last known value instead of signing the user out.
  useEffect(() => {
    if (step === "confirm" || step === "impression") {
      void refreshFreeStatus();
    }
  }, [step, refreshFreeStatus]);
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
  // Remodel: whether a hero question was pending at mount. A ref, so
  // a StrictMode double-run of the mount effect still skips the draft
  // restore after the question was consumed by the effect below.
  const heroQuestionSeenRef = useRef(false);
  useEffect(() => {
    queueMicrotask(() => {
      // Remodel (Velu, 2026-11-14): a question typed in the hero
      // question box is pending in sessionStorage. It is the freshest
      // intent, so the old draft is discarded, not merged: a new
      // question on top of an unrelated old story and category is a
      // mismatch. Only the Quick Insight intake reads it: the hero
      // only routes there.
      if (slug === "quick-insight" && peekHeroQuestion() !== null) {
        heroQuestionSeenRef.current = true;
        clearIntakeDraft();
      }
      const d = heroQuestionSeenRef.current
        ? null
        : getIntakeDraft(slug);
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
  // Remodel: consume the hero question only once the intake is usable
  // (the sign-in gate is null) AND the device flags are known. The
  // flags (usedFree, hadSession) are read in mount-effect microtasks,
  // so on the first render a guest who already used the free reading
  // still looks free and the gate is null; consuming then would lose
  // the question when the gate flips to "signin". draftReady is set
  // after those microtasks, so the gate is correct by the time this
  // runs. If the gate is showing, the seeker leaves to sign in and
  // comes back; the question waits in localStorage until then.
  // The read runs in a microtask, like the draft restore above: the
  // repo lints synchronous setState in an effect body as an error.
  useEffect(() => {
    if (authLoading || gate !== null || !draftReady) return;
    queueMicrotask(() => {
      // Check the slug BEFORE the destructive read: another spread's
      // intake must not consume (and discard) the Quick Insight
      // question.
      if (slug !== "quick-insight") return;
      const heroQuestion = takeHeroQuestion();
      if (heroQuestion) setQuestion(heroQuestion);
    });
  }, [slug, authLoading, gate, draftReady]);
  useEffect(() => {
    if (!draftReady || !categoryKey) return;
    const safe: Record<string, string> = {};
    for (const [k, v] of Object.entries(answers)) if (!SENSITIVE_KEYS.includes(k)) safe[k] = v;
    saveIntakeDraft({ slug, categoryKey, answers: safe, story, question });
  }, [draftReady, slug, categoryKey, answers, story, question]);

  // Point 6: "Start over" wipes the draft and the form, back to step 1.
  const startOver = () => {
    clearIntakeDraft();
    clearPendingAttemptId(`intake:${slug}`);
    setCategoryKey(null);
    setAnswers({});
    setStory("");
    setQuestion("");
    setStep("category");
  };

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

  // Batch 3b: the question is the ONLY required field (Velu:
  // "cut it"). The story is optional context and the category
  // fields are no longer rendered, so nothing else gates the
  // "Review my reading" button.
  const formValid = () => {
    if (!category) return false;
    return question.trim().length > 0;
  };

  // M1.1: drawing is free and separate from generation. The confirm
  // step draws the cards and shows them for a first impression; nothing
  // is spent until the seeker taps "Reveal my reading". Going back and
  // continuing again simply draws fresh cards.
  // Point 1 / item 4: one id per generation attempt, reused by retries AND by
  // a page reload (kept in localStorage, see pendingAttemptId) so a reading the
  // server already saved is replayed, never re-spent. It is tied to the story,
  // question and category, not to the drawn cards: re-drawing after a failure
  // must not mint a second id for a reading that may already be paid for.
  const beginDraw = () => {
    if (!category) return;
    // Review pushback: while the balance is unknown (credits null) do
    // not block with "out of Oracles". The server enforces the spend
    // and answers 402 with a clear message.
    if (!isFreeAvailable && freeStatusKnown && credits !== null && credits < 1) {
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
    // Review pushback: while the balance is unknown (credits null) do
    // not block with "out of Oracles". The server enforces the spend
    // and answers 402 with a clear message.
    if (!isFreeAvailable && freeStatusKnown && credits !== null && credits < 1) {
      setError("You are out of Oracles. Please top up to continue.");
      return;
    }
    setBusy(true);
    setProcessingLine(0);
    setProcessingComplete(false);
    // Batch 2b: a new attempt starts with an empty live preview.
    streamRef.current = "";
    lastFlushRef.current = 0;
    setStreamedText("");
    setStreamingModel(null);
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

    // "Not spent" is only ever said by the server (its error body). A dropped
    // connection or client-side failure can happen after the server committed.
    let failMessage = signedIn
      ? unconfirmedMessage("reading", "your journal")
      : "The reading could not be generated just now. Please try again in a moment.";
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

      const intakeScope = `intake:${slug}`;
      const attemptId = signedIn
        ? pendingAttemptId(intakeScope, JSON.stringify([slug, category.key, story.trim(), question.trim()]))
        : undefined;
      const res = await fetch("/api/reading/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          readingId: attemptId,
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
        }
        // Use the server's own message verbatim (503/402 bodies say "No Oracle was spent").
        const d = await res.json().catch(() => null);
        if (d?.error) failMessage = d.error;
        throw new Error(`Generation failed (${res.status})`);
      }

      // Batch 2b (SSE): the interpretation streams live. A `model`
      // event resets the preview (a new attempt discards the previous
      // attempt's text); `text` events grow it (throttled, so the wait
      // screen re-renders at most ~7x/s); `done` carries the
      // authoritative interpretation + the saved reading row; `error`
      // carries the server's message. If the stream ends without a
      // `done` event, the outcome is UNCONFIRMED: the server may have
      // saved already, so never say "No Oracle was spent" here. The
      // retry reuses the same attempt id and replays the saved reading
      // instead of re-spending (the failMessage above already says that).
      // One mutable object, not three `let`s: TypeScript narrows a
      // `let` that is only assigned inside a callback to `never`
      // (it cannot see the callback run). Property assignments on an
      // object are not narrowed that way.
      const stream: {
        data: {
          interpretation?: string;
          model?: string;
          free?: boolean;
          credits?: number;
          reading?: Reading;
          replayed?: boolean;
        } | null;
        error: { error?: string; status?: number } | null;
        sawDone: boolean;
      } = { data: null, error: null, sawDone: false };
      try {
        await readSse(res, (event) => {
          if (event.event === "model") {
            streamRef.current = "";
            setStreamedText("");
            const m = (event.data as { model?: string } | null)?.model;
            setStreamingModel(typeof m === "string" ? m : null);
          } else if (event.event === "reset") {
            // N1: the attempt that was streaming failed; clear its
            // text at once instead of showing a discarded reading
            // until the next model starts.
            streamRef.current = "";
            setStreamedText("");
          } else if (event.event === "text") {
            const delta = (event.data as { delta?: string } | null)?.delta;
            if (typeof delta === "string" && delta.length > 0) {
              streamRef.current += delta;
              const now = Date.now();
              if (now - lastFlushRef.current >= 150) {
                lastFlushRef.current = now;
                setStreamedText(streamRef.current);
              }
            }
          } else if (event.event === "done") {
            stream.sawDone = true;
            stream.data = event.data as typeof stream.data;
          } else if (event.event === "error") {
            stream.error = event.data as { error?: string; status?: number };
          }
        });
      } catch {
        // The stream itself broke (a dropped connection). Fall through
        // to the unconfirmed path below; the retry replays if saved.
      }
      // Flush any text that arrived after the last throttled update.
      setStreamedText(streamRef.current);
      if (stream.error) {
        if (stream.error.status === 402 || stream.error.status === 401) {
          was402 = true;
          if (stream.error.status === 401) setServerSignInNeeded(true);
        }
        if (stream.error.error) failMessage = stream.error.error;
        throw new Error(`Generation failed (${stream.error.status ?? "stream"})`);
      }
      if (!stream.sawDone || !stream.data?.interpretation) {
        // The stream ended without a `done` event: unconfirmed. The
        // server may have saved already; the retry (same attempt id)
        // replays it instead of re-spending.
        throw new Error("Generation stream ended without a result");
      }
      const interpretation: string = stream.data.interpretation;
      // The free reading is consumed only now, on a real generated
      // reading. The server marks its own record for signed-in users;
      // the device flag is the guest record. For a guest, the server
      // cookie is set by a separate call (Batch 2b): the streaming
      // response cannot set it.
      if (isFreeAvailable) {
        markFreeReadingUsed();
        setUsedFree(true);
        if (!signedIn) {
          void fetch("/api/auth/guest-free-used", { method: "POST" }).catch(() => {});
        }
      }

      // Signed-in: the server already saved this row with the spend, so its
      // row is required; a local copy under a new id would be a duplicate the
      // server cannot find. Guests get no server row and build one here.
      const reading: Reading = requireSavedReading(signedIn, stream.data.reading as Reading | undefined) ?? makeReading({
        spreadSlug: spread.slug,
        spreadName: `${spread.name} · ${category.name}`,
        cards,
        interpretation,
        aiGenerated: true,
        // Phase E (item 2): keep the serving model the API returned,
        // so the reading page can label it instead of discarding it.
        model: typeof stream.data.model === "string" && stream.data.model ? stream.data.model : undefined,
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
      clearPendingAttemptId(intakeScope);
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
    processingLine, processingComplete, streamedText, streamingModel, busy, generationFailed, toastOpen,
    setToastOpen, isFreeAvailable, gate, credits, category, questionSuggestion, set, formValid,
    beginDraw, beginGeneration, retryGeneration, startOver,
  };
}

export type IntakeState = ReturnType<typeof useIntakeFlow>;
