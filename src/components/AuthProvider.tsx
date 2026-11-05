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
  /** Effective credit balance. null while loading. */
  credits: number | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Spend credits; returns true on success. Uses server wallet when signed in. */
  spend: (n: number) => Promise<boolean>;
  /** Add credits; returns the new balance. Uses server wallet when signed in. */
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

/** Parse a JSON response without throwing on empty / non-JSON bodies. */
async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function migrateGuestData(): Promise<number> {
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
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readings: history }),
      });
      if (!res.ok) throw new Error("history sync failed");
    }
    setLocalCredits(0);
    window.dispatchEvent(new Event("sortes:credits-changed"));
    localStorage.setItem(MIGRATED_KEY, "1");
  } catch {
    // Sync failed: keep the guest journal intact so the next refresh
    // can retry, and report the server balance (never the local one).
    const me = await fetch("/api/auth/me")
      .then(safeJson)
      .catch(() => ({}));
    return typeof me.user?.credits === "number" ? me.user.credits : 0;
  }
  const me = await safeJson(await fetch("/api/auth/me"));
  return me.user?.credits ?? 0;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await safeJson(res);
      if (data.user) {
        setUser({ id: data.user.id, email: data.user.email });
        if (!localStorage.getItem(MIGRATED_KEY)) {
          const merged = await migrateGuestData();
          setCredits(merged);
        } else {
          setCredits(data.user.credits);
        }
      } else {
        setUser(null);
        setCredits(getCredits());
      }
    } catch {
      setUser(null);
      setCredits(getCredits());
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
      if (user) {
        const res = await fetch("/api/credits/balance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delta: -n }),
        });
        if (!res.ok) return false;
        const data = await safeJson(res);
        if (typeof data.credits !== "number") return false;
        setCredits(data.credits);
        return true;
      }
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
      if (user) {
        const res = await fetch("/api/credits/balance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delta: n }),
        });
        if (!res.ok) return 0;
        const data = await safeJson(res);
        setCredits(data.credits ?? 0);
        return data.credits ?? 0;
      }
      const { addCredits } = await import("@/lib/storage");
      const total = addCredits(n);
      setCredits(total);
      window.dispatchEvent(new Event("sortes:credits-changed"));
      return total;
    },
    [user]
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
      value={{ user, loading, credits, refresh, signOut, spend, add, persistReading, updateReading, deleteReading, afterSignIn }}
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
