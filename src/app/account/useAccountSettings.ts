"use client";

import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { clearLocalAccountData } from "@/lib/storage";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

export interface ServerTx {
  id: string;
  pack_type: string;
  amount: number;
  readings: number;
  created_at: string;
}

// Parse JSON defensively: a crashed or proxied API route can return an
// empty / non-JSON body, which should surface a friendly error, not a
// "Failed to execute 'json'" exception.
export const parseJson = async (res: Response): Promise<{ error?: string; [k: string]: unknown }> => {
  const text = await res.text();
  if (!text) throw new Error("The server returned an empty response. Please try again in a moment.");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The server returned an unexpected response. Please try again in a moment.");
  }
};

/**
 * Signed-in account settings: purchase history, password, export,
 * and deletion. `setError` is the page-wide auth error shared with
 * the sign-in form (savePassword has always written to it).
 */
export function useAccountSettings({
  userEmail,
  signOut,
  setError,
}: {
  userEmail: string | undefined;
  signOut: () => Promise<void>;
  setError: (e: string | null) => void;
}) {
  const [savePwBusy, setSavePwBusy] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [pwNotice, setPwNotice] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<ServerTx[] | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportDone, setExportDone] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  // Phase 6 (N4): deletion needs re-authentication — the account
  // password, or a fresh 6-digit email code (Resend path, same as
  // sign-in). A session cookie alone is no longer enough.
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteCode, setDeleteCode] = useState("");
  const [deleteCodeSent, setDeleteCodeSent] = useState(false);
  const [deleteCodeBusy, setDeleteCodeBusy] = useState(false);

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavePwBusy(true);
    setPwNotice(null);
    setError(null);
    try {
      const res = await fetchWithTimeout("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword, currentPassword }),
      });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setNewPassword("");
      setCurrentPassword("");
      setPwNotice("Password saved. You can now sign in with email + password.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSavePwBusy(false);
    }
  };

  const exportAccount = async () => {
    setExportBusy(true);
    setExportError(null);
    setExportDone(false);
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Export failed.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sortes-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportDone(true);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExportBusy(false);
    }
  };

  // Two taps to delete, like the journal's per-reading delete: the
  // first tap arms, the second confirms. The route deletes the user
  // and all server data; the device copies of the same data go too,
  // and the Supabase session is signed out so it cannot re-establish
  // a Sortes session on the next visit. Phase 6 (N4): the confirm
  // tap must also carry the account password or a fresh sign-in code.
  const requestDeleteCode = async () => {
    if (!userEmail || deleteCodeBusy) return;
    setDeleteCodeBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data.error ?? "Could not send a code.");
      setDeleteCodeSent(true);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not send a code.");
    } finally {
      setDeleteCodeBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (!deleteArmed) {
      setDeleteArmed(true);
      setDeleteError(null);
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(deletePassword ? { password: deletePassword } : {}),
          ...(deleteCode.trim() ? { code: deleteCode.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not delete your account.");
      }
      clearLocalAccountData();
      await getSupabaseBrowser()?.auth.signOut().catch(() => {});
      await signOut();
      setDeleted(true);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete your account.");
      setDeleteArmed(false);
    } finally {
      setDeleting(false);
    }
  };

  return {
    transactions,
    setTransactions,
    password: {
      currentPassword,
      setCurrentPassword,
      newPassword,
      setNewPassword,
      savePwBusy,
      pwNotice,
      savePassword,
    },
    data: {
      exportBusy,
      exportError,
      exportDone,
      exportAccount,
      deleteArmed,
      deleting,
      deleteError,
      deletePassword,
      setDeletePassword,
      deleteCode,
      setDeleteCode,
      deleteCodeSent,
      deleteCodeBusy,
      requestDeleteCode,
      deleteAccount,
    },
    deleted,
  };
}

export type AccountSettings = ReturnType<typeof useAccountSettings>;
