"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CREDIT_PACKS, perReadingPrice } from "@/lib/site";
import { useAuth } from "@/components/AuthProvider";
import { trackPurchaseCompleted } from "@/components/Analytics";

interface Props {
  open: boolean;
  onClose: () => void;
  reason?: string;
}

/**
 * Credit top-up.
 * - When Lemon Squeezy is configured (env vars set): real checkout. Guests
 *   check out with email only; the webhook auto-creates their account and
 *   grants credits instantly.
 * - Otherwise: clearly-labeled demo checkout so every flow stays testable.
 */
export default function CheckoutModal({ open, onClose, reason }: Props) {
  const { add, refresh, user } = useAuth();
  const [processing, setProcessing] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [realCheckout, setRealCheckout] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setEmail(user?.email ?? "");
      fetch("/api/checkout/lemonsqueezy")
        .then((r) => r.json())
        .then((d) => setRealCheckout(Boolean(d.enabled)))
        .catch(() => setRealCheckout(false));
    }
  }, [open, user]);

  const buyDemo = (packId: string, readings: number, price: number) => {
    setProcessing(packId);
    setTimeout(async () => {
      if (user) {
        // Signed in: record the transaction server-side (labeled demo) and grant.
        try {
          await fetch("/api/credits/record", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ packId, readings, price }),
          });
          await refresh();
        } catch {
          /* non-fatal in demo mode */
        }
      } else {
        const { recordPurchase } = await import("@/lib/storage");
        recordPurchase({ packId, readings, price, date: new Date().toISOString() });
        await add(readings);
      }
      setProcessing(null);
      setDone(packId);
      trackPurchaseCompleted(packId, price);
      setTimeout(() => {
        setDone(null);
        onClose();
      }, 1200);
    }, 900);
  };

  const buyReal = async (packId: string) => {
    setProcessing(packId);
    setError(null);
    try {
      const res = await fetch("/api/checkout/lemonsqueezy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId, email: email.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed.");
      trackPurchaseCompleted(packId, 0);
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
      setProcessing(null);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/85 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Top up credits"
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
              Top up credits
            </h2>
            {reason && (
              <p className="mt-2 text-center text-sm text-cream/75">{reason}</p>
            )}
            <p className="mt-2 text-center text-xs text-mist">
              1 credit = 1 full reading, any spread. Credits never expire.
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
                  className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream placeholder:text-mist/50 focus:border-gold/60 focus:outline-none"
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
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-display text-xl text-cream">
                        {p.readings} readings
                      </p>
                      <p className="text-xs text-mist">
                        ${perReadingPrice(p)} per reading
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-display text-2xl text-goldbright">
                        ${p.price.toFixed(2)}
                      </p>
                      <button
                        type="button"
                        disabled={processing !== null || realCheckout === null}
                        onClick={() =>
                          realCheckout
                            ? void buyReal(p.id)
                            : buyDemo(p.id, p.readings, p.price)
                        }
                        className="btn-gold rounded-xl px-5 py-2.5 text-sm font-bold disabled:opacity-60"
                      >
                        {processing === p.id
                          ? "…"
                          : done === p.id
                            ? "Added ✓"
                            : realCheckout
                              ? "Checkout"
                              : "Buy"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <p className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">
                {error}
              </p>
            )}

            {realCheckout ? (
              <p className="mt-5 rounded-xl bg-gold/10 p-3 text-center text-xs text-mist">
                Secure checkout by Lemon Squeezy. Your credits appear
                instantly after payment, and your account is created
                automatically from your email.
              </p>
            ) : (
              <p className="mt-5 rounded-xl bg-violet/10 p-3 text-center text-xs text-mist">
                Demo checkout: credits are added instantly for testing. Secure
                Lemon Squeezy payments arrive before launch; your price and packs
                stay the same.
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
