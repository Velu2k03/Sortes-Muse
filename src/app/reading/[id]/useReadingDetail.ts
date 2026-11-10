"use client";

import { useEffect, useState } from "react";
import { getReading, saveReading, updateReading as updateLocalReading } from "@/lib/storage";
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

    try {
      const { res, data } = await postFollowUp(reading, q);

      if (!res.ok) {
        // Phase D: every failure message states that no Oracle was
        // spent (the route spends only after success; guests are
        // refunded above), but only a genuine call failure gets the
        // toast and retry UI. A 402 is a balance stop.
        const msg = data.error || "Something went wrong. Please try again.";
        setFollowUpError(msg.includes("spent") ? msg : `${msg} No Oracle was spent.`);
        if (res.status !== 402 && res.status !== 401) {
          setFollowUpFailed(true);
          setFollowUpToastOpen(true);
        }
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
      setFollowUpError(
        "Could not reach the server. Please try again. No Oracle was spent."
      );
      setFollowUpFailed(true);
      setFollowUpToastOpen(true);
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
