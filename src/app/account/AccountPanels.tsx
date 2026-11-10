"use client";

import Link from "next/link";
import type { AccountSettings, ServerTx } from "./useAccountSettings";

/** AF-012: a skeleton, not a bare "Loading…" line. */
export function AccountLoading() {
  // The page shell above (H1 + intro) is already server HTML.
  return (
    <div className="mt-8 space-y-4" role="status" aria-label="Loading your account">
      <div className="h-40 animate-pulse rounded-3xl border border-gold/20 bg-panel/60" />
      <div className="h-24 animate-pulse rounded-3xl border border-gold/20 bg-panel/60" />
    </div>
  );
}

/**
 * P0-1: the auth load timed out or failed, so this page is
 * showing the sign-in form as a fallback instead of spinning
 * forever. The session may still be valid; retry re-checks.
 */
export function LoadErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="mt-6 rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm leading-relaxed text-cream">
      <p>
        We couldn&apos;t reach the server to check your sign-in, so
        this page is showing the sign-in form. If you already have
        an account, try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 font-semibold text-goldbright transition hover:border-goldbright"
      >
        Retry
      </button>
    </div>
  );
}

export function AccountSummary({
  email,
  credits,
  onSignOut,
}: {
  email: string;
  credits: number | null;
  onSignOut: () => void;
}) {
  return (
    <div className="mt-8 rounded-3xl border border-gold/20 bg-panel/60 p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-mist">
            Signed in as
          </p>
          <p className="mt-1 truncate text-lg text-cream">{email}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.2em] text-mist">
            Oracle balance
          </p>
          <p className="mt-1 font-display text-3xl text-goldbright">
            {credits ?? 0}
          </p>
        </div>
      </div>
      <div className="rule-gold my-6" />
      <div className="flex flex-wrap gap-3">
        <Link
          href="/oracles"
          className="btn-gold rounded-xl px-6 py-3 font-bold"
        >
          Get Oracles
        </Link>
        <button
          type="button"
          onClick={onSignOut}
          className="btn-ghost rounded-xl px-6 py-3 font-semibold"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

export function PurchaseHistory({ transactions }: { transactions: ServerTx[] | null }) {
  return (
    <div className="mt-6 rounded-3xl border border-gold/20 bg-panel/60 p-6 sm:p-8">
      <h2 className="font-display text-2xl text-goldbright">Purchase history</h2>
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
                {t.readings} Oracles · {t.pack_type === "admin-test-grant" ? "Test grant" : t.pack_type}
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
  );
}

export function PasswordPanel({ p }: { p: AccountSettings["password"] }) {
  return (
    <div className="mt-6 rounded-3xl border border-gold/20 bg-panel/60 p-6 sm:p-8">
      <h2 className="font-display text-xl text-cream">Password</h2>
      <p className="mt-1 text-sm text-cream/75">
        Set a password so you can sign in with email + password instead
        of a link each time.
      </p>
      <form onSubmit={p.savePassword} className="mt-4 space-y-4">
        <div>
          <label htmlFor="acct-current-password" className="mb-1.5 block text-sm font-medium text-cream">
            Current password <span className="font-normal text-mist">(only if you already have one)</span>
          </label>
          <input
            id="acct-current-password"
            type="password"
            value={p.currentPassword}
            onChange={(e) => p.setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none"
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
            value={p.newPassword}
            onChange={(e) => p.setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={p.savePwBusy || p.newPassword.length < 8}
          className="btn-gold rounded-xl px-6 py-3 font-bold disabled:opacity-100 disabled:saturate-50"
        >
          {p.savePwBusy ? "Saving…" : "Save password"}
        </button>
        {p.pwNotice && (
          <p className="rounded-xl border border-gold/40 bg-gold/10 p-3 text-sm text-goldbright">
            {p.pwNotice}
          </p>
        )}
      </form>
    </div>
  );
}

/**
 * Phase 3 (3.6): self-serve export and deletion. Export
 * downloads the account's Oracle balance, purchase history,
 * journal readings, and reports as one JSON file. Delete is
 * permanent: account, Oracles, journal, reports, and
 * purchase history, including the copies on this device.
 */
export function DataPanel({
  d,
  userEmail,
}: {
  d: AccountSettings["data"];
  userEmail: string | undefined;
}) {
  return (
    <div className="mt-6 rounded-3xl border border-gold/20 bg-panel/60 p-6 sm:p-8">
      <h2 className="font-display text-xl text-cream">Your data</h2>
      <p className="mt-1 text-sm text-cream/75">
        Download everything this account holds, or delete the
        account entirely.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void d.exportAccount()}
          disabled={d.exportBusy}
          className="btn-ghost rounded-xl px-6 py-3 font-semibold disabled:opacity-100 disabled:saturate-50"
        >
          {d.exportBusy ? "Exporting…" : "Export all data"}
        </button>
        <button
          type="button"
          onClick={() => void d.deleteAccount()}
          disabled={d.deleting}
          className="rounded-xl border border-danger/40 px-6 py-3 font-semibold text-danger hover:bg-danger/10 disabled:opacity-100 disabled:saturate-50"
        >
          {d.deleting
            ? "Deleting…"
            : d.deleteArmed
              ? "Confirm delete account?"
              : "Delete account"}
        </button>
      </div>
      {d.deleteArmed && !d.deleting && (
        <div role="alert" className="mt-3">
          <p className="text-sm text-danger">
            This permanently deletes your account, Oracles, journal,
            reports, and purchase history, including the copies on
            this device. This cannot be undone.
          </p>
          <p className="mt-2 text-sm text-cream/75">
            Confirm it is you: enter your account password, or a
            fresh 6-digit sign-in code.
          </p>
          <label htmlFor="delete-password" className="mt-3 block text-sm font-medium text-cream">
            Account password
          </label>
          <input
            id="delete-password"
            type="password"
            autoComplete="current-password"
            value={d.deletePassword}
            onChange={(e) => d.setDeletePassword(e.target.value)}
            placeholder="Your password"
            className="mt-1 w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-2.5 text-base text-cream focus:border-gold/60 focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-44 flex-1">
              <label htmlFor="delete-code" className="block text-sm font-medium text-cream">
                Or a fresh sign-in code
              </label>
              <input
                id="delete-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={d.deleteCode}
                onChange={(e) => d.setDeleteCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6-digit code"
                className="mt-1 w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-2.5 text-base text-cream focus:border-gold/60 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => void d.requestDeleteCode()}
              disabled={d.deleteCodeBusy || d.deleteCodeSent}
              className="btn-ghost rounded-xl px-4 py-2.5 font-semibold disabled:opacity-100 disabled:saturate-50"
            >
              {d.deleteCodeBusy ? "Sending…" : d.deleteCodeSent ? "Code sent" : "Send me a code"}
            </button>
          </div>
          {d.deleteCodeSent && (
            <p className="mt-2 text-sm text-goldbright">
              Code sent to {userEmail}. It expires in 10 minutes.
            </p>
          )}
          <p className="mt-2 text-sm text-cream/75">
            No password set on this account? Send a code, or set a
            password above first. Tap &ldquo;Confirm delete
            account?&rdquo; again to go ahead, or leave this page
            to cancel.
          </p>
        </div>
      )}
      {d.exportDone && (
        <p className="mt-3 text-sm text-goldbright">
          Your data has been downloaded.
        </p>
      )}
      {d.exportError && (
        <p className="mt-3 text-sm alert-error-text">{d.exportError}</p>
      )}
      {d.deleteError && (
        <p className="mt-3 text-sm alert-error-text">{d.deleteError}</p>
      )}
    </div>
  );
}
