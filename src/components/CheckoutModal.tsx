"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CREDIT_PACKS, apiPackId, perReadingPrice } from "@/lib/site";
import { useAuth } from "@/components/AuthProvider";
import { trackPurchaseCompleted } from "@/components/Analytics";
import { useFocusTrap } from "@/components/useFocusTrap";

interface Props {
  open: boolean;
  onClose: () => void;
  reason?: string;
  // Pack the visitor already picked (credits card direct flow, guests
  // only: signed-in visitors skip this modal entirely). Shown as
  // Selected so the guest does not re-pick; the modal is only the
  // email step, because the checkout API needs an email before Lemon
  // Squeezy so credits have an account to land on.
  initialPackId?: string | null;
}

/**
 * Credit top-up via Lemon Squeezy only. Phase 1 (1.5) deleted the
 * demo checkout: it granted Oracles for free in production code, so
 * it is gone, not hidden. When Lemon Squeezy is not configured the
 * modal says checkout is unavailable instead of granting anything.
 */
export default function CheckoutModal({ open, onClose, reason, initialPackId }: Props) {
  const { user } = useAuth();
  const [processing, setProcessing] = useState<string | null>(null);
  const [realCheckout, setRealCheckout] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  // P0-4: focus moves into the dialog on open, Tab is trapped inside,
  // Escape closes (this modal had no Escape handler before), and focus
  // returns to the trigger on close.
  const dialogRef = useFocusTrap<HTMLDivElement>(open, onClose);

  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setError(null);
        setEmail(user?.email ?? "");
      });
      fetch("/api/checkout/lemonsqueezy")
        .then((r) => r.json())
        .then((d) => setRealCheckout(Boolean(d.enabled)))
        .catch(() => setRealCheckout(false));
    }
  }, [open, user]);

  const buyReal = async (packId: string) => {
    const trimmed = email.trim();
    // Guests must give an email: the webhook delivers credits to that
    // address, and it becomes their account on sign-in.
    if (!user && !trimmed) {
      setError("Please enter your email so your Oracles reach your account.");
      return;
    }
    setProcessing(packId);
    setError(null);
    try {
      const res = await fetch("/api/checkout/lemonsqueezy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: apiPackId(packId), email: trimmed || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed.");
      trackPurchaseCompleted(packId, 0);
      // Remember the purchase email so /account can prefill the sign-in
      // form after the payment redirect.
      if (trimmed) {
        try {
          sessionStorage.setItem("sortes-purchase-email", trimmed);
        } catch {
          /* Storage unavailable; non-fatal, the flow continues without it. */
        }
      }
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
      setProcessing(null);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={dialogRef}
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/85 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Top up Oracles"
        >
          <motion.div
            className="w-full max-w-lg rounded-t-3xl border border-gold/30 bg-navydeep p-6 sm:rounded-3xl sm:p-8"
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-center font-display text-3xl text-goldbright">
              Top up Oracles
            </h2>
            {reason && (
              <p className="mt-2 text-center text-sm text-cream/75">{reason}</p>
            )}
            <p className="mt-2 text-center text-xs text-mist">
              1 Oracle = 1 full reading. Oracles never expire.
            </p>

            {realCheckout && !user && (
              <div className="mt-5">
                <label htmlFor="checkout-email" className="mb-1.5 block text-sm font-medium text-cream">
                  Email for your receipt and account
                </label>
                <input
                  id="checkout-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist focus:border-gold/60 focus:outline-none"
                />
              </div>
            )}

            <div className="mt-6 space-y-3">
              {CREDIT_PACKS.map((p) => (
                <div
                  key={p.id}
                  className={`relative rounded-2xl border p-4 transition ${
                    p.popular
                      ? "border-gold/70 bg-gold/10"
                      : "border-gold/20 bg-panel/60"
                  }`}
                >
                  {p.popular && (
                    <span className="absolute -top-2.5 left-4 rounded-full bg-gold px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-ink">
                      Most popular
                    </span>
                  )}
                  {initialPackId === p.id && (
                    <span className="absolute -top-2.5 right-4 rounded-full bg-goldbright px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-ink">
                      Selected
                    </span>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-display text-xl text-cream">
                        {p.name} · <span className="font-body text-goldbright">{p.readings}</span> Oracles
                      </p>
                      <p className="text-xs text-mist">
                        ${perReadingPrice(p)} per Oracle
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-display text-2xl text-goldbright">
                        ${p.price.toFixed(2)}
                      </p>
                      <button
                        type="button"
                        disabled={processing !== null || realCheckout !== true}
                        onClick={() => void buyReal(p.id)}
                        className="btn-gold rounded-xl px-5 py-2.5 text-sm font-bold disabled:opacity-60"
                      >
                        {processing === p.id ? "…" : "Checkout"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <p className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm alert-error-text">
                {error}
              </p>
            )}

            {realCheckout === false ? (
              <p className="mt-5 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-center text-xs alert-error-text">
                Checkout is not available right now. Please try again later.
              </p>
            ) : (
              <p className="mt-5 rounded-xl bg-gold/10 p-3 text-center text-xs text-mist">
                Secure checkout by Lemon Squeezy. Oracles appear instantly
                after payment; your account is created from your email.
              </p>
            )}
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold"
            >
              Not now
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
