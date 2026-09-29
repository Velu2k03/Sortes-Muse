"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CREDIT_PACKS, perReadingPrice } from "@/lib/site";
import { getCredits } from "@/lib/storage";
import CheckoutModal from "@/components/CheckoutModal";

/**
 * Credits page: balance, pack pricing, purchase history.
 * Phase 7/8: balance syncs to DB and history lists real transactions.
 */
export default function CreditsPage() {
  const [credits, setCredits] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setCredits(getCredits());
    const sync = () => setCredits(getCredits());
    window.addEventListener("sortes:credits-changed", sync);
    return () => window.removeEventListener("sortes:credits-changed", sync);
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-gold">Credits</p>
        <h1 className="mt-3 font-display text-5xl text-goldbright sm:text-6xl">
          Your balance
        </h1>
        <p className="mt-6 font-display text-7xl text-cream">
          {credits}
          <span className="ml-2 align-middle font-body text-lg text-mist">
            {credits === 1 ? "reading" : "readings"}
          </span>
        </p>
        <p className="mx-auto mt-4 max-w-md text-sm text-cream/75">
          1 credit = 1 full reading, any spread. Your daily card is always
          free and never uses a credit. Credits never expire.
        </p>
      </div>

      <div className="mt-10 space-y-4">
        {CREDIT_PACKS.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.5 }}
            className={`relative rounded-3xl border p-6 ${
              p.popular
                ? "border-gold/70 bg-gold/10"
                : "border-gold/20 bg-panel/60"
            }`}
          >
            {p.popular && (
              <span className="absolute -top-3 left-6 rounded-full bg-gold px-4 py-1 text-xs font-bold uppercase tracking-wider text-ink">
                Most popular
              </span>
            )}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-display text-3xl text-cream">
                  {p.readings} readings
                </p>
                <p className="mt-1 text-sm text-mist">
                  ${perReadingPrice(p)} per reading · ${(p.price / p.readings).toFixed(2)} each
                </p>
              </div>
              <p className="font-display text-4xl text-goldbright">
                ${p.price.toFixed(2)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={`mt-5 w-full rounded-xl px-4 py-3 font-bold ${
                p.popular ? "btn-gold" : "btn-ghost"
              }`}
            >
              Buy {p.readings} readings
            </button>
          </motion.div>
        ))}
      </div>

      <div className="mt-10 rounded-2xl border border-gold/20 bg-panel/50 p-6">
        <p className="font-display text-xl text-goldbright">Purchase history</p>
        <p className="mt-2 text-sm text-mist">
          No purchases yet on this device. After checkout, every transaction
          (pack, amount, date) is listed here and, once you sign in, synced
          to your account.
        </p>
      </div>

      <p className="mx-auto mt-8 max-w-md text-center text-xs leading-relaxed text-mist/80">
        Pay-per-reading, no subscriptions. Prices include everything; there
        are no hidden fees. Secure checkout is powered by Lemon Squeezy.
      </p>

      <CheckoutModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
