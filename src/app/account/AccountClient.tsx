"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { fetchWithTimeout, withTimeout } from "@/lib/fetch-timeout";
import { authErrorMessage, reasonFromSupabaseError } from "@/lib/auth-callback";
import { safeReturnTo, stashReturnTo, takeReturnTo } from "@/lib/storage";
import { parseJson, useAccountSettings } from "./useAccountSettings";
import {
  AccountLoading,
  AccountSummary,
  DataPanel,
  LoadErrorBanner,
  PasswordPanel,
  PurchaseHistory,
  SubscriptionPanel,
  type SubscriptionStatus,
} from "./AccountPanels";

type AuthStep = "email" | "sent" | "code";

// Dev-only fallback: local dev code length without Supabase.
const codeLength = 6;

/**
 * F30 (2026-11-09): the page is a thin shell. Sign-in state and
 * actions stay in this file (AccountClient.test.ts pins the Supabase
 * redirect calls here); the signed-in panels and their state live in
 * AccountPanels.tsx and useAccountSettings.ts.
 */
export default function AccountPage() {
  const { user, loading, loadError, credits, signOut, afterSignIn, refresh } = useAuth();
  const s = useSignIn(afterSignIn);
  const settings = useAccountSettings({
    userEmail: user?.email,
    signOut,
    setError: s.setError,
  });
  const { setTransactions } = settings;
  const { setStep, setEmail } = s;
  const [subscription, setSubscription] = useState<SubscriptionStatus>(null);

  useEffect(() => {
    if (user) {
      fetch("/api/credits/transactions")
        .then((r) => r.json())
        .then((d) => setTransactions(d.transactions ?? []))
        .catch(() => setTransactions([]));
      fetch("/api/subscription")
        .then((r) => r.json())
        .then((d) => setSubscription(d.subscription ? d : { subscription: null, portalUrl: null, monthlyCredits: null, purchasedCredits: null }))
        .catch(() => setSubscription({ subscription: null, portalUrl: null, monthlyCredits: null, purchasedCredits: null }));
    } else {
      queueMicrotask(() => {
        setTransactions(null);
        setSubscription(null);
        setStep("email");
        // Prefill the email used at checkout, so guests who just paid can
        // sign in and claim their Oracles without retyping it.
        try {
          const purchased = sessionStorage.getItem("sortes-purchase-email");
          if (purchased) setEmail((e) => e || purchased);
        } catch {
          /* Storage unavailable; non-fatal, the flow continues without it. */
        }
      });
    }
  }, [user, setTransactions, setStep, setEmail]);

  useAuthErrorFromUrl(s.setAuthTab, s.setError);
  useReturnTo(!!user);

  if (loading) {
    // AF-012: a skeleton, not a bare "Loading…" line.
    return <AccountLoading />;
  }

  // AF-012: the H1 + intro live in page.tsx as server HTML, so this
  // client component renders only the form / account panels.
  return (
    <div className="mt-8">

      {loadError && <LoadErrorBanner onRetry={() => void refresh()} />}

      {!user ? (
        <SignInPanel s={s} />
      ) : (
        <>
          <AccountSummary email={user.email} credits={credits} onSignOut={() => void signOut()} />
          <SubscriptionPanel subscription={subscription} />
          <PurchaseHistory transactions={settings.transactions} />
          <PasswordPanel p={settings.password} />
          <DataPanel d={settings.data} userEmail={user?.email} />
        </>
      )}
    </div>
  );
}

/** Sign-in / create-account form state and actions. */
function useSignIn(afterSignIn: () => Promise<void>) {
  const [step, setStep] = useState<AuthStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [authTab, setAuthTab] = useState<"password" | "link">("password");
  // Phase 3 (3.6): Create account and Sign in are two equal top-level
  // paths, not a sub-toggle hidden under one method. The method tabs
  // (password / email link) sit one level below and apply to both.
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [password, setPassword] = useState("");

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwBusy(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(
        mode === "signin" ? "/api/auth/login" : "/api/auth/signup",
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
      setPwBusy(false);
    }
  };

  // Google OAuth via Supabase: redirects to Google, which returns to
  // /auth/callback with a code, the same route the magic link uses.
  // The browser client is the one the email-link flow already uses.
  // On success the page navigates away, so googleBusy is only reset
  // on error.
  const signInWithGoogle = async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setError("Google sign-in is not available right now. Please use an email link or password.");
      return;
    }
    setGoogleBusy(true);
    setError(null);
    try {
      const { error } = await withTimeout(
        supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/auth/callback` },
        })
      );
      if (error) throw new Error(error.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setGoogleBusy(false);
    }
  };

  const requestCode = async (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    setLinkBusy(true);
    setError(null);
    setDevCode(null);
    try {
      // Supabase magic link in production: Supabase sends the sign-in link
      // directly to the email. Local dev without Supabase falls back
      // to the local verification code.
      const supabase = getSupabaseBrowser();
      if (supabase) {
        const { error } = await withTimeout(
          supabase.auth.signInWithOtp({
            email: email.trim().toLowerCase(),
            // Use the origin the visitor is actually on, not the hardcoded
            // canonical domain: Supabase only allows redirect URLs that are
            // in its allow list, and the canonical domain was not in it,
            // which rejected the link request. The visitor's origin must
            // be in that list (vercel.app already is; resonantatlas.com
            // must be added in the Supabase dashboard).
            options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
          })
        );
        if (error) throw new Error(error.message);
        setStep("sent");
        return;
      }
      // Dev-only fallback: no Supabase browser client configured
      const res = await fetchWithTimeout("/api/auth/request-code", {
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
      setLinkBusy(false);
    }
  };

  // Dev-only fallback: verifies the code against /api/auth/verify-code
  // when running without Supabase.
  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeBusy(true);
    setError(null);
    try {
      const res = await fetchWithTimeout("/api/auth/verify-code", {
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
      setCodeBusy(false);
    }
  };

  return {
    step, setStep, email, setEmail, code, setCode, pwBusy, linkBusy, codeBusy,
    googleBusy, error, setError, devCode, authTab, setAuthTab, mode, setMode,
    password, setPassword, submitPassword, signInWithGoogle, requestCode, verifyCode,
  };
}

/**
 * Point 6: the intake gate links here with ?returnTo=/intake/<slug>. Remember
 * it (Google and the email link come back through /auth/callback, which drops
 * the query), and once signed in, go back to that spread so the draft restores.
 */
function useReturnTo(signedIn: boolean) {
  const router = useRouter();
  useEffect(() => {
    const p = safeReturnTo(new URLSearchParams(window.location.search).get("returnTo"));
    if (p) stashReturnTo(p);
    if (!signedIn) return;
    const dest = takeReturnTo();
    if (dest) router.replace(dest);
  }, [signedIn, router]);
}

/**
 * Brutal audit F2 (2026-11-08): /auth/callback lands here with
 * ?auth=error&reason=<code>, and Supabase falls back to #error=… when
 * a redirect URL is not on its allow list. Both used to be ignored,
 * so a failed link silently showed the signed-out form. Show the
 * mapped message once, then strip the params so a reload is clean.
 */
function useAuthErrorFromUrl(
  setAuthTab: (t: "password" | "link") => void,
  setError: (e: string | null) => void
) {
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      let message: string | null = null;
      if (url.searchParams.get("auth") === "error") {
        message = authErrorMessage(url.searchParams.get("reason"));
      } else if (hash.get("error") || hash.get("error_code")) {
        message = authErrorMessage(
          reasonFromSupabaseError(hash.get("error_code"), hash.get("error_description"))
        );
      }
      if (url.searchParams.has("auth") || url.searchParams.has("reason") || hash.has("error")) {
        url.searchParams.delete("auth");
        url.searchParams.delete("reason");
        url.hash = "";
        window.history.replaceState(window.history.state, "", url.pathname + url.search);
      }
      if (message) {
        const text = message;
        queueMicrotask(() => {
          setAuthTab("link");
          setError(text);
        });
      }
    } catch {
      /* URL parsing unavailable; nothing to show. */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** The signed-out panel: Google, then password or email link. */
function SignInPanel({ s }: { s: ReturnType<typeof useSignIn> }) {
  const {
    step, setStep, email, setEmail, code, setCode, pwBusy, linkBusy, codeBusy,
    googleBusy, error, setError, devCode, authTab, setAuthTab, mode, setMode,
    password, setPassword, submitPassword, signInWithGoogle, requestCode, verifyCode,
  } = s;
  return (
    <div className="mt-8 rounded-3xl border border-gold/20 bg-panel/60 p-6 sm:p-8">
      <h2 className="font-display text-2xl text-cream">
        {mode === "signin"
          ? "Sign in to sync everything"
          : "Create your account"}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-cream/75">
        {mode === "signin"
          ? "Your guest Oracles and journal move into your account automatically, then follow you across devices. You stay signed in for 30 days."
          : "One account keeps your Oracles, journal, and reports synced across devices. Sign in with Google, an email link, or a password."}
      </p>

      {/* Phase 3 (3.6): two equal paths. */}
      <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl border border-gold/25 bg-panel/70 p-1">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
              setStep("email");
            }}
            className={`rounded-lg px-4 py-3 text-sm font-semibold transition ${
              mode === m
                ? "bg-gold/20 text-goldbright"
                : "text-mist hover:text-cream"
            }`}
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      {/* Google OAuth: one tap, same /auth/callback as the magic
          link, so a Google sign-in bridges to a Sortes session
          the same way. Shown for both sign-in and create-account. */}
      <button
        type="button"
        onClick={() => void signInWithGoogle()}
        disabled={googleBusy}
        className="btn-ghost mt-4 flex w-full items-center justify-center rounded-xl px-6 py-3.5 font-bold disabled:opacity-100 disabled:saturate-50"
      >
        <span
          aria-hidden="true"
          className="mr-2.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-gold/40 text-sm font-bold text-goldbright"
        >
          G
        </span>
        {googleBusy ? "Redirecting to Google…" : "Continue with Google"}
      </button>
      <div className="mt-4 flex items-center gap-3 text-xs text-mist">
        <span className="h-px flex-1 bg-gold/20" aria-hidden="true" />
        <span>or continue with email</span>
        <span className="h-px flex-1 bg-gold/20" aria-hidden="true" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl border border-gold/25 bg-panel/70 p-1">
        {(["password", "link"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setAuthTab(t);
              setError(null);
              if (t === "link") setStep("email");
            }}
            className={`rounded-lg px-4 py-3 text-sm font-semibold transition ${
              authTab === t
                ? "bg-gold/20 text-goldbright"
                : "text-mist hover:text-cream"
            }`}
          >
            {t === "password" ? "Password" : "Email link"}
          </button>
        ))}
      </div>

      {authTab === "password" ? (
        <form onSubmit={submitPassword} className="mt-6 space-y-4">
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
              className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none"
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
              placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={pwBusy}
            className="btn-gold w-full rounded-xl px-6 py-3.5 font-bold disabled:opacity-100 disabled:saturate-50"
          >
            {pwBusy
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
          {mode === "signin" && (
            <p className="text-center text-xs text-mist">
              Bought Oracles with a different email? They merge in when
              you sign in with that address.
            </p>
          )}
        </form>
      ) : step === "email" ? (
        <form onSubmit={requestCode} className="mt-6 space-y-4">
          <p className="text-sm text-cream/75">
            We will send a sign-in link to this email. Open the email and
            click the link to sign in.
          </p>
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
              className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none"
            />
          </div>
          {mode === "signup" && (
            <p className="text-center text-xs text-mist">
              No account with this email yet? Signing in with an email link
              creates one.
            </p>
          )}
          <button
            type="submit"
            disabled={linkBusy}
            className="btn-gold w-full rounded-xl px-6 py-3.5 font-bold disabled:opacity-100 disabled:saturate-50"
          >
            {linkBusy ? "Sending…" : "Send sign-in link"}
          </button>
        </form>
      ) : step === "sent" ? (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-cream/75">
            We sent a sign-in link to{" "}
            <span className="text-goldbright">{email}</span>. Click the link
            in the email to sign in. The link expires in 1 hour.
          </p>
          <button
            type="button"
            onClick={() => void requestCode()}
            disabled={linkBusy}
            className="btn-gold w-full rounded-xl px-6 py-3.5 font-bold disabled:opacity-100 disabled:saturate-50"
          >
            {linkBusy ? "Sending…" : "Send a new link"}
          </button>
          <button
            type="button"
            onClick={() => setStep("email")}
            className="btn-ghost w-full rounded-xl px-6 py-3 font-semibold"
          >
            Use a different email
          </button>
        </div>
      ) : (
        /* Dev-only fallback: no Supabase browser client configured.
           Uses /api/auth/request-code + /api/auth/verify-code with devCode. */
        <form onSubmit={verifyCode} className="mt-6 space-y-4">
          <p className="text-sm text-cream/75">
            We sent a {codeLength}-digit code to <span className="text-goldbright">{email}</span>.
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
              maxLength={codeLength}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-center text-2xl tracking-[0.5em] text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none"
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
            disabled={codeBusy || code.length !== codeLength}
            className="btn-gold w-full rounded-xl px-6 py-3.5 font-bold disabled:opacity-100 disabled:saturate-50"
          >
            {codeBusy ? "Verifying…" : "Sign in"}
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
        <p className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm alert-error-text">
          {error}
        </p>
      )}
    </div>
  );
}
