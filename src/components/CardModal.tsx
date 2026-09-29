"use client";

import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { getCard, suitLabel } from "@/lib/cards";

interface Props {
  cardId: string | null;
  onClose: () => void;
}

/**
 * Card detail sheet. Keywords-first layout (Biddy Tarot pattern):
 * upright/reversed keyword chips at the top, full story below.
 */
export default function CardModal({ cardId, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const card = cardId ? getCard(cardId) : null;

  return (
    <AnimatePresence>
      {card && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={card.name}
        >
          <motion.div
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-gold/30 bg-navydeep p-6 sm:rounded-3xl sm:p-8"
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-6 sm:flex-row">
              <div className="relative mx-auto h-64 w-40 shrink-0 overflow-hidden rounded-xl border border-gold/40 sm:mx-0">
                <Image
                  src={card.image}
                  alt={card.name}
                  fill
                  sizes="160px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.25em] text-mist">
                  {card.arcana === "major"
                    ? `Major Arcana · ${card.number}`
                    : `${suitLabel(card.suit ?? "")} · ${card.name.replace(/^.*of /, "")}`}
                </p>
                <h2 className="mt-1 font-display text-4xl text-goldbright">
                  {card.name}
                </h2>

                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-gold">
                      Upright
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {card.keywords.upright.map((k) => (
                        <span
                          key={k}
                          className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs text-goldbright"
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-widest text-violet">
                      Reversed
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {card.keywords.reversed.map((k) => (
                        <span
                          key={k}
                          className="rounded-full border border-violet/40 bg-violet/10 px-3 py-1 text-xs text-cream"
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-5 border-t border-gold/20 pt-6">
              <section>
                <h3 className="font-display text-xl text-gold">Upright meaning</h3>
                <p className="mt-2 leading-relaxed text-cream/90">
                  {card.meaning.upright}
                </p>
              </section>
              <section>
                <h3 className="font-display text-xl text-gold">Reversed meaning</h3>
                <p className="mt-2 leading-relaxed text-cream/90">
                  {card.meaning.reversed}
                </p>
              </section>
              <p className="text-xs italic text-mist">
                Readings are mirrors for reflection, not predictions of a fixed
                future.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="btn-ghost mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold"
            >
              Close
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
