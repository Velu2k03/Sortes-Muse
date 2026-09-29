"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CREDIT_PACKS, perReadingPrice } from "@/lib/site";
import { addCredits } from "@/lib/storage";
import { trackPurchaseCompleted } from "@/components/Analytics";

interface Props {
  open: boolean;
  onClose: () => void;
  reason?: string;
}

/**
 * Credit top-up. NOTE (Phase 4): purchases are a clearly-labeled demo
 * checkout so every flow is testable. Phase 8 replaces this with the real
 * Lemon Squeezy checkout + webhook; the UI stays the same.
 */
export default function CheckoutModal({ open, onClose, reason }: Props) {
  const [processing, setProcessing] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const buy = (packId: string, readings: number, price: number) => {
    setProcessing(packId);
    // Demo checkout: instant grant. Real Lemon Squeezy flow arrives in Phase 8.
    setTimeout(() => {
      addCredits(readings);
      setProcessing(null);
      setDone(packId);
      trackPurchaseCompleted(packId, price);
      setTimeout(() => {
        setDone(null);
        onClose();
      }, 1200);
    }, 900);
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
                        disabled={processing !== null}
                        onClick={() => buy(p.id, p.readings, p.price)}
                        className="btn-gold rounded-xl px-5 py-2.5 text-sm font-bold disabled:opacity-60"
                      >
                        {processing === p.id
                          ? "…"
                          : done === p.id
                            ? "Added ✓"
                            : "Buy"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-5 rounded-xl bg-violet/10 p-3 text-center text-xs text-mist">
              Demo checkout: credits are added instantly for testing. Secure
              Lemon Squeezy payments arrive before launch; your price and packs
              stay the same.
            </p>
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
