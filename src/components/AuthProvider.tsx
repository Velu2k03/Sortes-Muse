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
} from "@/lib/storage";
import type { Reading } from "@/lib/types";

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
  /** Run after a successful sign-in: merge guest wallet + history. */
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
  const localCredits = getCredits();
  const history = getHistory();
  if (localCredits > 0) {
    try {
      const res = await fetch("/api/credits/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localCredits }),
      });
      const data = await safeJson(res);
      // Only zero the local wallet when the server confirms the merge.
      // A failed merge keeps local credits so the next refresh can retry.
      if (!res.ok || typeof data.credits !== "number") {
        throw new Error("merge failed");
      }
      setLocalCredits(0);
      window.dispatchEvent(new Event("sortes:credits-changed"));
      if (history.length > 0) {
        await fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ readings: history }),
        }).catch(() => {});
      }
      localStorage.setItem(MIGRATED_KEY, "1");
      return data.credits;
    } catch {
      // Merge failed: keep the guest wallet intact and report the
      // server balance (or the local one) so nothing is lost.
      const me = await fetch("/api/auth/me")
        .then(safeJson)
        .catch(() => ({}));
      return typeof me.user?.credits === "number"
        ? me.user.credits
        : localCredits;
    }
  }
  if (history.length > 0) {
    await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readings: history }),
    }).catch(() => {});
  }
  localStorage.setItem(MIGRATED_KEY, "1");
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
    refresh();
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

  return (
    <AuthContext.Provider
      value={{ user, loading, credits, refresh, signOut, spend, add, persistReading, afterSignIn }}
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
