"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

interface ServerTx {
  id: string;
  pack_type: string;
  amount: number;
  readings: number;
  created_at: string;
}

type AuthStep = "email" | "code";

export default function AccountPage() {
  const { user, loading, credits, signOut, afterSignIn } = useAuth();
  const [step, setStep] = useState<AuthStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [authTab, setAuthTab] = useState<"password" | "code">("password");
  const [pwMode, setPwMode] = useState<"signin" | "signup">("signin");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [pwNotice, setPwNotice] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<ServerTx[] | null>(null);

  useEffect(() => {
    if (user) {
      fetch("/api/credits/transactions")
        .then((r) => r.json())
        .then((d) => setTransactions(d.transactions ?? []))
        .catch(() => setTransactions([]));
    } else {
      setTransactions(null);
      setStep("email");
      // Prefill the email used at checkout, so guests who just paid can
      // sign in and claim their credits without retyping it.
      try {
        const purchased = sessionStorage.getItem("sortes-purchase-email");
        if (purchased) setEmail((e) => e || purchased);
      } catch {}
    }
  }, [user]);

  // Parse JSON defensively: a crashed or proxied API route can return an
  // empty / non-JSON body, which should surface a friendly error, not a
  // "Failed to execute 'json'" exception.
  const parseJson = async (res: Response): Promise<{ error?: string; [k: string]: unknown }> => {
    const text = await res.text();
    if (!text) throw new Error("The server returned an empty response. Please try again in a moment.");
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("The server returned an unexpected response. Please try again in a moment.");
    }
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        pwMode === "signin" ? "/api/auth/login" : "/api/auth/signup",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        }
      );
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setPassword("");
      await afterSignIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setPwNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/auth/set-password", {
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
      setBusy(false);
    }
  };

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDevCode(null);
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setStep("code");
      if (data.devCode) setDevCode(data.devCode as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      await afterSignIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center text-mist">
        Loading your account…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <p className="text-center text-xs uppercase tracking-[0.35em] text-gold">
        Account
      </p>
      <h1 className="mt-3 text-center font-display text-5xl text-goldbright">
        Your account
      </h1>

      {!user ? (
        <div className="mt-8 rounded-3xl border border-gold/20 bg-panel/60 p-6 sm:p-8">
          <p className="font-display text-2xl text-cream">
            Sign in to sync everything
          </p>
          <p className="mt-2 text-sm leading-relaxed text-cream/75">
            Your guest credits and journal move into your account
            automatically, then follow you across devices. You stay signed
            in for 30 days.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl border border-gold/25 bg-panel/70 p-1">
            {(["password", "code"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setAuthTab(t);
                  setError(null);
                  if (t === "code") setStep("email");
                }}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  authTab === t
                    ? "bg-gold/20 text-goldbright"
                    : "text-mist hover:text-cream"
                }`}
              >
                {t === "password" ? "Password" : "Email code"}
              </button>
            ))}
          </div>

          {authTab === "password" ? (
            <form onSubmit={submitPassword} className="mt-6 space-y-4">
              <div className="flex gap-4 text-sm">
                {(["signin", "signup"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setPwMode(m);
                      setError(null);
                    }}
                    className={`border-b-2 pb-1 font-semibold transition ${
                      pwMode === m
                        ? "border-gold text-goldbright"
                        : "border-transparent text-mist hover:text-cream"
                    }`}
                  >
                    {m === "signin" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>
              <div>
                <label htmlFor="acct-email" className="mb-1.5 block text-sm font-medium text-cream">
                  Email address
                </label>
                <input
                  id="acct-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist/50 focus:border-gold/60 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="acct-password" className="mb-1.5 block text-sm font-medium text-cream">
                  Password
                </label>
                <input
                  id="acct-password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={pwMode === "signup" ? "At least 8 characters" : "Your password"}
                  autoComplete={pwMode === "signup" ? "new-password" : "current-password"}
                  className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist/50 focus:border-gold/60 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="btn-gold w-full rounded-xl px-6 py-3.5 font-bold disabled:opacity-50"
              >
                {busy
                  ? "Please wait…"
                  : pwMode === "signin"
                    ? "Sign in"
                    : "Create account"}
              </button>
              {pwMode === "signin" && (
                <p className="text-center text-xs text-mist">
                  Bought credits with a different email? They merge in when
                  you sign in with that address.
                </p>
              )}
            </form>
          ) : step === "email" ? (
            <form onSubmit={requestCode} className="mt-6 space-y-4">
              <div>
                <label htmlFor="acct-email" className="mb-1.5 block text-sm font-medium text-cream">
                  Email address
                </label>
                <input
                  id="acct-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist/50 focus:border-gold/60 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="btn-gold w-full rounded-xl px-6 py-3.5 font-bold disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send sign-in code"}
              </button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="mt-6 space-y-4">
              <p className="text-sm text-cream/75">
                We sent a 6-digit code to <span className="text-goldbright">{email}</span>.
              </p>
              <div>
                <label htmlFor="acct-code" className="mb-1.5 block text-sm font-medium text-cream">
                  Sign-in code
                </label>
                <input
                  id="acct-code"
                  type="text"
                  inputMode="numeric"
                  required
                  pattern="\d{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-center text-2xl tracking-[0.5em] text-cream placeholder:text-mist/50 focus:border-gold/60 focus:outline-none"
                />
              </div>
              {devCode && (
                <p className="rounded-xl border border-gold/40 bg-gold/10 p-3 text-sm text-goldbright">
                  Dev mode (no email provider configured): your code is{" "}
                  <strong className="tracking-[0.3em]">{devCode}</strong>
                </p>
              )}
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="btn-gold w-full rounded-xl px-6 py-3.5 font-bold disabled:opacity-50"
              >
                {busy ? "Verifying…" : "Sign in"}
              </button>
              <button
                type="button"
                onClick={() => setStep("email")}
                className="btn-ghost w-full rounded-xl px-6 py-3 font-semibold"
              >
                Use a different email
              </button>
            </form>
          )}

          {error && (
            <p className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="mt-8 rounded-3xl border border-gold/20 bg-panel/60 p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.2em] text-mist">
                  Signed in as
                </p>
                <p className="mt-1 truncate text-lg text-cream">{user.email}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-[0.2em] text-mist">
                  Credit balance
                </p>
                <p className="mt-1 font-display text-3xl text-goldbright">
                  {credits ?? 0}
                </p>
              </div>
            </div>
            <div className="rule-gold my-6" />
            <div className="flex flex-wrap gap-3">
              <Link
                href="/credits"
                className="btn-gold rounded-xl px-6 py-3 font-bold"
              >
                Top up credits
              </Link>
              <button
                type="button"
                onClick={() => void signOut()}
                className="btn-ghost rounded-xl px-6 py-3 font-semibold"
              >
                Sign out
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-gold/20 bg-panel/60 p-6 sm:p-8">
            <p className="font-display text-2xl text-goldbright">Purchase history</p>
            {transactions === null ? (
              <p className="mt-2 text-sm text-mist">Loading…</p>
            ) : transactions.length === 0 ? (
              <p className="mt-2 text-sm text-mist">
                No purchases yet. Every transaction (email, pack type, amount,
                date) will be listed here.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {transactions.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-gold/15 bg-panel/40 px-4 py-3 text-sm"
                  >
                    <span className="text-cream">
                      {t.readings} readings · {t.pack_type}
                    </span>
                    <span className="shrink-0 text-mist">
                      ${Number(t.amount).toFixed(2)} ·{" "}
                      {new Date(t.created_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-6 rounded-3xl border border-gold/20 bg-panel/60 p-6 sm:p-8">
            <p className="font-display text-xl text-cream">Password</p>
            <p className="mt-1 text-sm text-cream/70">
              Set a password so you can sign in with email + password instead
              of a code each time.
            </p>
            <form onSubmit={savePassword} className="mt-4 space-y-4">
              <div>
                <label htmlFor="acct-current-password" className="mb-1.5 block text-sm font-medium text-cream">
                  Current password <span className="font-normal text-mist">(only if you already have one)</span>
                </label>
                <input
                  id="acct-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist/50 focus:border-gold/60 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="acct-new-password" className="mb-1.5 block text-sm font-medium text-cream">
                  New password
                </label>
                <input
                  id="acct-new-password"
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist/50 focus:border-gold/60 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={busy || newPassword.length < 8}
                className="btn-gold rounded-xl px-6 py-3 font-bold disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save password"}
              </button>
              {pwNotice && (
                <p className="rounded-xl border border-gold/40 bg-gold/10 p-3 text-sm text-goldbright">
                  {pwNotice}
                </p>
              )}
            </form>
          </div>
        </>
      )}
    </div>
  );
}
