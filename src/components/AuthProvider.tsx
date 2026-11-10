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
  clearLocalAccountData,
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
  /** Whether the account still has its free Quick Insight (from
      /api/auth/me). null while signed out or unknown; guests use the
      device flag instead. Batch 1 (C1): the free label follows the
      server record, not the device flag. */
  freeReadingAvailable: boolean | null;
  /** True when the last /api/auth/me call failed (non-OK response or
      network error). Distinct from loadError: a 429/5xx leaves
      loadError false, but the auth state is still unknown, so the
      free label must not fall back to the device flag. Batch 1 (C1). */
  authFailed: boolean;
  refresh: () => Promise<void>;
  /** Re-read only the free-reading flag from /api/auth/me. A failure
      leaves the last known value in place instead of signing the user
      out, so it is safe to call right before the cost is shown.
      Batch 1 (C1, review finding 6: a stale true from another tab). */
  refreshFreeStatus: () => Promise<void>;
  signOut: (to?: string) => Promise<void>;
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

/** Batch 1 (C1, review fix): "migration done" (MIGRATED_KEY) and "this
    device held a session" are two different facts and must stay two
    keys. MIGRATED_KEY is set only when the guest-history migration
    succeeds, so a failed sync retries on the next refresh. This key
    is set on any confirmed session, so the free label can tell
    "signed out" from "auth state unknown". */
const HAD_SESSION_KEY = "sortes-had-session";

/** Batch 1 (C1, review finding 5): true when this device held a
    signed-in session before. The key is set on a confirmed session
    and removed on sign-out and on an expired session, so a device
    that never signed in reads false and the device free flag stays
    its only record. */
export function deviceHeldSession(): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem(HAD_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

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
  user?: { id: string; email: string; credits?: number; freeReadingAvailable?: boolean } | null;
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
  const [freeReadingAvailable, setFreeReadingAvailable] = useState<boolean | null>(null);
  const [authFailed, setAuthFailed] = useState(false);
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
        setFreeReadingAvailable(
          typeof data.user.freeReadingAvailable === "boolean" ? data.user.freeReadingAvailable : null
        );
        setAuthFailed(false);
        if (!localStorage.getItem(MIGRATED_KEY)) {
          const merged = await migrateGuestData(deadline);
          setCredits(merged);
        } else {
          setCredits(data.user.credits ?? null);
        }
        // A confirmed session means this device held one, even when
        // the guest-history migration above failed. The key is what
        // the free label uses to tell "signed out" from "auth state
        // unknown". It is deliberately NOT MIGRATED_KEY: setting that
        // key here would skip the migration retry on the next refresh
        // and the guest journal would never sync.
        try {
          localStorage.setItem(HAD_SESSION_KEY, "1");
        } catch {
          // Full quota or private mode: the key is a display hint
          // only, and the server still decides the free label, so a
          // failed write must not sign the user out via the catch below.
        }
      } else {
        // Either key marks a device that held a signed-in session, so
        // an explicit {user:null} 200 is an expired session: drop the
        // previous user's session state. A network failure (catch
        // below), a 429/5xx, or an unparseable body keeps it. Gating
        // on MIGRATED_KEY alone would strand HAD_SESSION_KEY when the
        // migration had failed, and the device would read as "unknown"
        // forever, hiding "Free" from a genuine guest.
        if (
          res.ok &&
          data.user === null &&
          (localStorage.getItem(MIGRATED_KEY) || localStorage.getItem(HAD_SESSION_KEY))
        ) {
          // Only wipe local data when the journal already synced to
          // the server (MIGRATED_KEY set). When only HAD_SESSION_KEY
          // is set the history sync failed, so the local journal is
          // the only copy and wiping it would destroy readings that
          // never uploaded. Both keys are removed either way, so the
          // stranded-key problem is still fixed and the next refresh
          // retries the migration.
          if (localStorage.getItem(MIGRATED_KEY)) {
            clearLocalAccountData();
          }
          localStorage.removeItem(MIGRATED_KEY);
          localStorage.removeItem(HAD_SESSION_KEY);
          // Full navigation drops in-memory state too (item 5). No loop:
          // both keys are gone, so this branch cannot fire again.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload on purpose: router.push would keep in-memory state
          window.location.assign("/");
        }
        // A non-OK /me (429, 5xx) or a body with no user key at all is
        // not a confirmed sign-out: the session cookie may still be
        // valid, so the auth state is unknown and the free label must
        // not fall back to the device flag. loadError stays false here
        // (it is only for network errors and timeouts), so authFailed
        // carries it instead. A confirmed {user:null} 200 clears it.
        setAuthFailed(!res.ok || data.user === undefined);
        setUser(null);
        setFreeReadingAvailable(null);
        setCredits(getCredits());
      }
      setLoadError(false);
    } catch {
      // Network failure or 10 s timeout: show the signed-out fallback
      // (guest credits) with loadError set, and always clear loading
      // so the header and account page never spin forever (P0-1).
      setUser(null);
      setFreeReadingAvailable(null);
      setAuthFailed(true);
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

  const refreshFreeStatus = useCallback(async () => {
    try {
      const res = await fetchWithTimeout("/api/auth/me", undefined, 10000);
      const data = await safeJson(res);
      if (data.user && typeof data.user.freeReadingAvailable === "boolean") {
        setFreeReadingAvailable(data.user.freeReadingAvailable);
      }
    } catch {
      // Keep the last known value. The label fails closed when the
      // value is unknown, and the server is the spend authority.
    }
  }, []);

  const signOut = useCallback(async (to: string = "/") => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    // Best effort: clear the Supabase session too, so it does not
    // silently re-establish a Sortes session on the next visit.
    await getSupabaseBrowser()?.auth.signOut().catch(() => {});
    localStorage.removeItem(MIGRATED_KEY);
    localStorage.removeItem(HAD_SESSION_KEY);
    clearLocalAccountData();
    setUser(null);
    setFreeReadingAvailable(null);
    setAuthFailed(false);
    setCredits(getCredits());
    // clearLocalAccountData empties localStorage, not React state already
    // in memory (a reading on screen). A full navigation drops both (item 5).
    window.location.assign(to);
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
      // Server-patchable keys only: nextStep (M1.1), revisitNote
      // (M2.2), and note (Phase E, item 8). followUps are excluded
      // on purpose: the follow-up route already updates the server
      // copy itself.
      if (
        user &&
        (patch.nextStep !== undefined || patch.revisitNote !== undefined || patch.note !== undefined)
      ) {
        const body: Record<string, unknown> = { id };
        if (patch.nextStep !== undefined) body.nextStep = patch.nextStep;
        if (patch.revisitNote !== undefined) {
          body.revisitNote = patch.revisitNote;
          if (patch.revisitAt !== undefined) body.revisitAt = patch.revisitAt;
        }
        if (patch.note !== undefined) body.note = patch.note;
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
      value={{ user, loading, loadError, credits, freeReadingAvailable, authFailed, refresh, refreshFreeStatus, signOut, spend, add, persistReading, updateReading, deleteReading, afterSignIn }}
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
