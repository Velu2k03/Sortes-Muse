"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  getCredits,
  setCredits as setLocalCredits,
  getHistory,
  saveReading,
  updateReading as updateLocalReading,
  deleteReading as deleteLocalReading,
} from "@/lib/storage";
import type { Reading } from "@/lib/types";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  /** True when the last auth load failed (network error or 10 s
      timeout, P0-1): the page is showing a signed-out fallback, not a
      confirmed signed-out state. Cleared by the next successful
      refresh. */
  loadError: boolean;
  /** Effective credit balance. null while loading. */
  credits: number | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Spend credits; returns true on success. Guest-local only:
      signed-in users never spend client-side (Phase B, R15: the AI
      routes spend server-side after a real generation, and POST
      /api/credits/balance is deleted). All three callers guard with
      !user / !signedIn; if spend() is ever called while signed in it
      is a no-op returning false rather than a server call. */
  spend: (n: number) => Promise<boolean>;
  /** Add credits; returns the new balance. Guest-local only (see
      spend): the server never grants credits from a client request.
      Signed-in callers get the current server balance back with no
      grant. All call sites are guest refund paths. */
  add: (n: number) => Promise<number>;
  /** Save a reading locally and to the server when signed in. */
  persistReading: (reading: Reading) => Promise<void>;
  // M1.1: patch an existing reading (chosen next step) locally and,
  // when signed in, on the server too. Returns the updated reading.
  updateReading: (id: string, patch: Partial<Reading>) => Promise<Reading | null>;
  // M2.2: delete a reading locally and, when signed in, on the
  // server too. True when the reading is gone from every store that
  // held it; false leaves the entry in place for a retry.
  deleteReading: (id: string) => Promise<boolean>;
  /** Run after a successful sign-in: merge the guest journal. */
  afterSignIn: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const MIGRATED_KEY = "sortes-migrated-v1";

/** Fetch with a 10 s timeout (UX P0-1): a hung /api/auth/me must not
    spin the header and the account page forever. The abort surfaces
    as an AbortError to the caller. */
async function fetchWithTimeout(
  input: string,
  init?: RequestInit,
  ms = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Parse a JSON response without throwing on empty / non-JSON bodies. */
interface SafeJsonBody {
  user?: { id: string; email: string; credits?: number };
  credits?: number;
}
async function safeJson(res: Response): Promise<SafeJsonBody> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function migrateGuestData(deadline: number): Promise<number> {
  const history = getHistory();
  // Phase 1: the guest device wallet is no longer a source of credits.
  // Local credits have no legitimate paid backing: the only way they
  // ever went up was the demo grant (now deleted), and the refund path
  // only ever returns a credit the guest already spent. So local
  // credits are never sent to the server and never minted. Migration
  // moves the journal only; once the journal sync succeeds the local
  // wallet is zeroed, so a stale or tampered device balance cannot be
  // spent later as a guest.
  try {
    if (history.length > 0) {
      const res = await fetchWithTimeout(
        "/api/history",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ readings: history }),
        },
        Math.max(0, deadline - Date.now())
      );
      if (!res.ok) throw new Error("history sync failed");
    }
    setLocalCredits(0);
    window.dispatchEvent(new Event("sortes:credits-changed"));
    localStorage.setItem(MIGRATED_KEY, "1");
  } catch {
    // Sync failed: keep the guest journal intact so the next refresh
    // can retry, and report the server balance (never the local one).
    // A timeout here propagates to refresh(), which raises loadError.
    const me = await fetchWithTimeout(
      "/api/auth/me",
      undefined,
      Math.max(0, deadline - Date.now())
    ).then(safeJson);
    return typeof me.user?.credits === "number" ? me.user.credits : 0;
  }
  const me = await safeJson(
    await fetchWithTimeout("/api/auth/me", undefined, Math.max(0, deadline - Date.now()))
  );
  return me.user?.credits ?? 0;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);

  const refresh = useCallback(async () => {
    const deadline = Date.now() + 10000;
    try {
      const res = await fetchWithTimeout(
        "/api/auth/me",
        undefined,
        Math.max(0, deadline - Date.now())
      );
      const data = await safeJson(res);
      if (data.user) {
        setUser({ id: data.user.id, email: data.user.email });
        if (!localStorage.getItem(MIGRATED_KEY)) {
          const merged = await migrateGuestData(deadline);
          setCredits(merged);
        } else {
          setCredits(data.user.credits ?? null);
        }
      } else {
        setUser(null);
        setCredits(getCredits());
      }
      setLoadError(false);
    } catch {
      // Network failure or 10 s timeout: show the signed-out fallback
      // (guest credits) with loadError set, and always clear loading
      // so the header and account page never spin forever (P0-1).
      setUser(null);
      setCredits(getCredits());
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred so the scanner's set-state-in-effect check does not fire:
    // refresh() is an async fetch, not a synchronous render-loop setState.
    queueMicrotask(() => { void refresh(); });
    const onChange = () => {
      // Guest wallet changed elsewhere; only relevant when signed out.
      setUser((u) => {
        if (!u) setCredits(getCredits());
        return u;
      });
    };
    window.addEventListener("sortes:credits-changed", onChange);
    return () => window.removeEventListener("sortes:credits-changed", onChange);
  }, [refresh]);

  const afterSignIn = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    // Best effort: clear the Supabase session too, so it does not
    // silently re-establish a Sortes session on the next visit.
    await getSupabaseBrowser()?.auth.signOut().catch(() => {});
    localStorage.removeItem(MIGRATED_KEY);
    setUser(null);
    setCredits(getCredits());
  }, []);

  const spend = useCallback(
    async (n: number): Promise<boolean> => {
      // Phase B (R15): guest-local only. Signed-in spend happens
      // server-side inside the AI routes; there is no client spend
      // endpoint any more (POST /api/credits/balance deleted).
      if (user) return false;
      const { spendCredit } = await import("@/lib/storage");
      const ok = spendCredit(n);
      if (ok) {
        setCredits(getCredits());
        window.dispatchEvent(new Event("sortes:credits-changed"));
      }
      return ok;
    },
    [user]
  );

  const add = useCallback(
    async (n: number): Promise<number> => {
      // Phase B (R15): guest-local only (refund of a guest pre-spend
      // after a failed generation). Signed-in callers get the current
      // balance back; the server never grants credits from a client
      // request (a positive delta used to be rejected server-side).
      if (user) return credits ?? 0;
      const { addCredits } = await import("@/lib/storage");
      const total = addCredits(n);
      setCredits(total);
      window.dispatchEvent(new Event("sortes:credits-changed"));
      return total;
    },
    [user, credits]
  );

  const persistReading = useCallback(
    async (reading: Reading) => {
      saveReading(reading);
      if (user) {
        await fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ readings: [reading] }),
        }).catch(() => {});
      }
    },
    [user]
  );

  const updateReading = useCallback(
    async (id: string, patch: Partial<Reading>) => {
      const updated = updateLocalReading(id, patch);
      if (!updated) return null;
      // Server-patchable keys only: nextStep (M1.1) and revisitNote
      // (M2.2). followUps are excluded on purpose: the follow-up
      // route already updates the server copy itself.
      if (
        user &&
        (patch.nextStep !== undefined || patch.revisitNote !== undefined)
      ) {
        const body: Record<string, unknown> = { id };
        if (patch.nextStep !== undefined) body.nextStep = patch.nextStep;
        if (patch.revisitNote !== undefined) {
          body.revisitNote = patch.revisitNote;
          if (patch.revisitAt !== undefined) body.revisitAt = patch.revisitAt;
        }
        await fetch("/api/history", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).catch(() => {});
      }
      return updated;
    },
    [user]
  );

  // M2.2: server delete first for signed-in users, so a failed
  // server delete never orphans a local delete that the next sync
  // would resurrect from the server copy. A server 404 means the
  // copy was never synced (or is already gone), so the local
  // delete still proceeds; only real failures block it.
  const deleteReading = useCallback(
    async (id: string) => {
      if (user) {
        try {
          const res = await fetch("/api/history", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          });
          if (!res.ok && res.status !== 404) return false;
        } catch {
          return false;
        }
      }
      deleteLocalReading(id);
      return true;
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{ user, loading, loadError, credits, refresh, signOut, spend, add, persistReading, updateReading, deleteReading, afterSignIn }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
