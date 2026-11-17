"use client";

import { useState } from "react";
import { Dialog } from "@base-ui-components/react/dialog";
import { getCard, suitLabel } from "@/lib/cards";
import HoloCard from "@/components/HoloCard";
import AnimatedContent from "@/components/AnimatedContent";

interface Props {
  cardId: string | null;
  onClose: () => void;
}

/**
 * Card detail sheet. Keywords-first layout (Biddy Tarot pattern):
 * upright/reversed keyword chips at the top, full story below.
 *
 * All-pages fix 5 (base-ui refactor, 2026-11-17): the dialog shell
 * is base-ui Dialog, which owns focus trapping, Escape, backdrop
 * dismissal, and focus return to the element that opened it. The
 * old hand-rolled useFocusTrap hook (deleted with this change, it
 * had no other consumer) and the motion/AnimatePresence wrapper are
 * gone. Entrance/exit are CSS transitions on data-starting-style /
 * data-ending-style, 250ms, inside the transitions.dev 150-250ms
 * band; the old motion spring settled in ~400ms. The panel classes,
 * the close button, the HoloCard, and the inner AnimatedContent
 * wipe are unchanged, and the panel keeps overscroll-contain on
 * the same class list as overflow-y-auto (all-pages fix 9).
 * Base-ui locks body scroll while a modal dialog is open; the old
 * hand-rolled shell did not. That is the standard dialog behaviour.
 */
export default function CardModal({ cardId, onClose }: Props) {
  const live = cardId ? getCard(cardId) : null;
  // Keep the last opened card mounted through the closing
  // transition: the parent clears cardId when onClose fires, which
  // would otherwise unmount the content before the exit animation
  // runs and leave an empty panel sliding away. Adjusted during
  // render, not in an effect (the React pattern for "adjust state
  // when a prop changes"); getCard returns a stable Map reference,
  // so the identity check cannot loop. The state keeps the name
  // `card` so the eyebrow template literals below stay
  // byte-identical to the old shell (locked by the F15 test).
  const [card, setCard] = useState(live);
  if (live && live !== card) setCard(live);

  return (
    <Dialog.Root
      open={live !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-sm transition-opacity duration-250 motion-reduce:transition-none data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
          {/* aria-modal: base-ui Dialog.Popup does not set it
              itself (no aria-modal in the 1.0.0-rc.0 dialog code),
              so it is set here, restoring the old hand-rolled
              shell's contract, which the fix-9 test locks. */}
          <Dialog.Popup
            aria-modal="true"
            className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-t-3xl border border-gold/30 bg-navydeep p-6 transition-[transform,opacity] duration-250 ease-out motion-reduce:transition-none sm:rounded-3xl sm:p-8 data-[starting-style]:translate-y-[60px] data-[starting-style]:opacity-0 data-[ending-style]:translate-y-[60px] data-[ending-style]:opacity-0">
            {card && (
              <>
                <Dialog.Close
                  aria-label="Close card details"
                  className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-gold/40 bg-navydeep/90 text-xl leading-none text-goldbright hover:border-gold hover:bg-gold/20"
                >
                  ×
                </Dialog.Close>
                <AnimatedContent trigger="mount" wipe="up" blur={10} distance={60} duration={0.8} scale={0.98} threshold={0.2} stagger={0.08}>
                <div className="flex flex-col gap-6 sm:flex-row">
                  <div className="mx-auto shrink-0 sm:mx-0">
                    {/* One card only, so one WebGL context. Gold preset and
                        Sortes gold foil keep it in the site palette. No
                        back image, so it is not flippable and a tap here
                        never conflicts with closing the modal. If WebGL
                        fails, the plain card image underneath still shows. */}
                    <HoloCard
                      image={card.image}
                      alt={card.name}
                      preset="gold"
                      // Batch 3.4: the foil colour comes from the brand
                      // token, not the old gold hex (same fix as the
                      // daily page).
                      foilColor="var(--color-gold)"
                      width={160}
                      radius={12}
                    />
                  </div>
                  <div className="min-w-0 flex-1 text-center sm:text-left">
                    <p className="text-sm text-mist">
                      {card.arcana === "major"
                        ? `Major Arcana, card ${card.number}`
                        : /* The name itself is the title below, so repeating
                           it here showed the name twice. The eyebrow now
                           carries the arcana and suit instead. */
                          `Minor Arcana, ${card.suit ? suitLabel(card.suit) : ""}`}
                    </p>
                    <Dialog.Title className="mt-1 font-display text-4xl text-goldbright">
                      {card.name}
                    </Dialog.Title>

                    <div className="mt-4 space-y-3">
                      <div>
                        <p className="text-sm text-gold">
                          Upright
                        </p>
                        <div className="mt-1 flex flex-wrap justify-center gap-1.5 sm:justify-start">
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
                        {/* Was text-violet: 4.33:1 on navydeep, below WCAG AA 4.5:1.
                            Cream is 14.74:1 on the same background. The reversed
                            chips below use a gold border and tint, not violet. */}
                        <p className="text-sm text-cream">
                          Reversed
                        </p>
                        <div className="mt-1 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                          {card.keywords.reversed.map((k) => (
                            <span
                              key={k}
                              className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs text-cream"
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
                    Readings are for reflection, not predictions of a fixed
                    future.
                  </p>
                </div>
                </AnimatedContent>
              </>
            )}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
