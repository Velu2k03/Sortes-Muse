"use client";

import { useEffect, useState } from "react";
import { getReading, saveReading, updateReading as updateLocalReading, pendingAttemptId, clearPendingAttemptId } from "@/lib/storage";
import type { Reading } from "@/lib/types";
import { postFollowUp } from "@/lib/follow-up-client";
import { useAuth } from "@/components/AuthProvider";

type SetReading = (r: Reading | null) => void;

/**
 * Loads the reading: local copy first, then the signed-in server
 * history as a fallback.
 */
export function useReading(id: string, user: unknown) {
  const [reading, setReading] = useState<Reading | null | undefined>(undefined);

  // Codex fresh review on PR 51, correct: ReturnLoop can now link a
  // server-only reading, but this page read local storage only and
  // showed "Reading not found" on a new device. Fall back to the
  // server history (full reading objects) when no local copy exists.
  useEffect(() => {
    const local = getReading(id);
    if (local) {
      // Phase 4C lint: setState deferred a microtask past the effect.
      queueMicrotask(() => setReading(local));
      return;
    }
    if (!user) {
      queueMicrotask(() => setReading(null));
      return;
    }
    let cancelled = false;
    fetch("/api/history")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const found = (d.readings ?? []).find((r: { id: string }) => r.id === id);
        // Codex fresh review on PR 51, correct: opening the reading
        // is not enough. Save and revisit-note controls call
        // updateReading, which returns early when the reading is
        // absent from local storage, so edits on this new-device
        // path were silently lost. Hydrate the server copy locally
        // so those updates work and PATCH the server copy too.
        if (found && !getReading(id)) saveReading(found as Reading);
        setReading((found as Reading) ?? null);
      })
      .catch(() => {
        if (!cancelled) setReading(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id, user]);

  return { reading, setReading };
}

/**
 * One editable text field saved onto the reading (next step, note,
 * revisit note). The input is prefilled from the saved value once the
 * reading loads, so clearing the field actually clears it instead of
 * falling back. Phase 4C lint: the set is deferred a microtask past
 * the effect. The dependency is reading?.id on purpose: depending on
 * the whole reading object would re-prefill (and wipe user edits) on
 * every reading update, for example after a save.
 */
export function useReadingField(
  reading: Reading | null | undefined,
  setReading: SetReading,
  pick: (r: Reading) => string | undefined
) {
  const { updateReading } = useAuth();
  const [input, setInput] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (reading) queueMicrotask(() => setInput(pick(reading) ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading?.id]);

  const onChange = (value: string) => {
    setInput(value);
    setSaved(false);
  };

  const save = async (patch: (value: string) => Partial<Reading>) => {
    const value = input.trim();
    if (!value || !reading) return;
    setSaving(true);
    const updated = await updateReading(reading.id, patch(value));
    setSaving(false);
    if (updated) {
      setReading(updated);
      setSaved(true);
    }
  };

  return { input, onChange, saved, saving, save };
}

export type ReadingField = ReturnType<typeof useReadingField>;

/** M2.1: follow-up thread state and the ask call. */
export function useFollowUp(reading: Reading | null | undefined, setReading: SetReading) {
  const { user, refresh } = useAuth();
  const [followUpQ, setFollowUpQ] = useState("");
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  // Phase D: followUpFailed marks a genuine call failure (not a
  // balance stop) and drives the persistent retry UI; the toast flag
  // drives the transient toast on top of it.
  const [followUpFailed, setFollowUpFailed] = useState(false);
  const [followUpToastOpen, setFollowUpToastOpen] = useState(false);

  // Batch 1 (C2): after a failure, re-read the server copy before the
  // button re-enables. A dropped connection can hide a follow-up the
  // server already saved; the refresh surfaces it, so the button label
  // (free vs 1 Oracle) and the thread state come from the server, not
  // the stale local copy. Tri-state on purpose: "saved" and "not-saved"
  // are proven, "unknown" means the check itself failed, and the UI
  // must not claim "No Oracle was spent" on unknown. The match is on
  // the attempt id ONLY: matching on question text would mistake an
  // older answer to the same question for this attempt.
  type ServerRefresh = "saved" | "not-saved" | "unknown";
  const refreshFromServer = async (attemptId: string): Promise<ServerRefresh> => {
    if (!reading) return "unknown";
    try {
      const res = await fetch("/api/history");
      if (!res.ok) return "unknown";
      const d = await res.json();
      const found = (d.readings ?? []).find((r: { id: string }) => r.id === reading.id) as Reading | undefined;
      if (!found) return "unknown";
      const saved = updateLocalReading(reading.id, { followUps: found.followUps ?? [] });
      setReading(saved ?? found);
      const list = (found.followUps ?? []) as Array<{ id?: string }>;
      return list.some((f) => f.id === attemptId) ? "saved" : "not-saved";
    } catch {
      return "unknown";
    }
  };

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

    // Guests get no follow-ups (the route returns 401): say so up front
    // instead of spending from the device wallet and refunding.
    if (!user) {
      setFollowUpError("Sign in to ask a follow-up. No Oracle was spent.");
      setFollowUpLoading(false);
      return;
    }

    // Batch 1 (C2): one attempt id per question, reused by retries and
    // across a reload (6h TTL), so a retry after a lost response replays
    // the saved answer instead of generating and spending a duplicate.
    // Cleared on success; kept on failure.
    const attemptScope = `follow-up:${reading.id}`;
    const attemptId = pendingAttemptId(attemptScope, q);

    try {
      const { res, data } = await postFollowUp(reading, q, { followUpId: attemptId });

      if (!res.ok) {
        // Phase D: a 402 is a balance stop, told to top up, not to
        // retry. A 401 is an expired session. Both are definitive.
        if (res.status === 402 || res.status === 401) {
          const msg = data.error || "Something went wrong. Please try again.";
          setFollowUpError(msg.includes("spent") ? msg : `${msg} No Oracle was spent.`);
          setFollowUpLoading(false);
          return;
        }
        // Ambiguous failures only: a 5xx with no server error body
        // may hide a follow-up the server saved before the response
        // was lost, so check before re-enabling the button. A 5xx
        // that carries a server error body ("No Oracle was spent"),
        // a 409 limit, and a 400 are definitive: no extra history
        // call, just the server message.
        if (res.status >= 500 && !data.error) {
          const state = await refreshFromServer(attemptId);
          if (state === "saved") {
            clearPendingAttemptId(attemptScope);
            setFollowUpError(null);
            setFollowUpFailed(false);
            setFollowUpToastOpen(false);
            setFollowUpQ("");
            await refresh();
            setFollowUpLoading(false);
            return;
          }
          if (state === "unknown") {
            setFollowUpError(
              "We could not confirm whether your follow-up was saved. Retrying is safe: the same request will not charge twice."
            );
            setFollowUpFailed(true);
            setFollowUpToastOpen(true);
            setFollowUpLoading(false);
            return;
          }
          // "not-saved": the follow-up was not saved YET at check
          // time. The server may still be generating, so do not claim
          // no spend; the retry is safe either way, because the
          // attempt id replays a later save instead of charging twice.
          setFollowUpError(
            "Your follow-up was not saved yet. Please try again. Retrying is safe: the same request will not charge twice."
          );
          setFollowUpFailed(true);
          setFollowUpToastOpen(true);
          setFollowUpLoading(false);
          return;
        }
        const msg = data.error || "Something went wrong. Please try again.";
        setFollowUpError(msg.includes("spent") ? msg : `${msg} No Oracle was spent.`);
        setFollowUpFailed(true);
        setFollowUpToastOpen(true);
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

      clearPendingAttemptId(attemptScope);
      setFollowUpQ("");
    } catch {
      // A network drop or an unparseable body (a gateway 502/504
      // returns HTML, so res.json() throws in postFollowUp): genuinely
      // ambiguous, so check the server before offering the retry.
      const state = await refreshFromServer(attemptId);
      if (state === "saved") {
        clearPendingAttemptId(attemptScope);
        setFollowUpError(null);
        setFollowUpFailed(false);
        setFollowUpToastOpen(false);
        setFollowUpQ("");
        await refresh();
      } else if (state === "unknown") {
        setFollowUpError(
          "We could not confirm whether your follow-up was saved. Retrying is safe: the same request will not charge twice."
        );
        setFollowUpFailed(true);
        setFollowUpToastOpen(true);
      } else {
        // "not-saved": the follow-up was not saved YET at check time;
        // the server may still be generating, so do not claim no spend.
        setFollowUpError(
          "Could not reach the server. Your follow-up was not saved yet. Please try again. Retrying is safe: the same request will not charge twice."
        );
        setFollowUpFailed(true);
        setFollowUpToastOpen(true);
      }
    } finally {
      setFollowUpLoading(false);
    }
  };

  return {
    followUpQ,
    setFollowUpQ,
    followUpLoading,
    followUpError,
    setFollowUpError,
    followUpFailed,
    followUpToastOpen,
    setFollowUpToastOpen,
    askFollowUp,
  };
}

export type FollowUpState = ReturnType<typeof useFollowUp>;
