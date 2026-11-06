"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  getDailyCard,
  setDailyCard,
  getDailyPracticeDays,
  getReading,
  makeReading,
  type DailyCardState,
} from "@/lib/storage";
import { useAuth } from "@/components/AuthProvider";
import { getCard, orientationKeywords, orientationMeaning } from "@/lib/cards";
import { drawSingle } from "@/lib/tarot";
import TarotCard from "@/components/TarotCard";
import CardModal from "@/components/CardModal";
import { trackDailyCardDrawn } from "@/components/Analytics";
import { StarBorder } from "@/components/ReactBits";
import HoldButton from "@/components/HoldButton";
import HoloCard from "@/components/HoloCard";
import Link from "next/link";

type Phase = "idle" | "shuffling" | "revealed";

/**
 * Daily Card: one free card per day, zero intake, zero friction.
 * The drawn card is stored with the date; returning the same day shows it.
 */
export default function DailyPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [daily, setDaily] = useState<DailyCardState | null>(null);
  // Phase E (item 6): the streak badge is gone. Practice is counted
  // in days practiced, total and in the last 30, and never resets.
  const [practice, setPractice] = useState({ total: 0, last30: 0 });
  const [zoomOpen, setZoomOpen] = useState(false);
  const drawTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { persistReading, updateReading } = useAuth();
  // Evening return: one line on where the card's quality showed up.
  const [reflection, setReflection] = useState("");
  const [reflectionSaved, setReflectionSaved] = useState(false);
  // HoldButton colours bypass the theme tokens, so track the
  // document theme, 2026-11-04, instead of staying dark in light mode.
  const [siteTheme, setSiteTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const sync = () =>
      setSiteTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);


  // Phase E (item 6): the daily card is kept as a lightweight
  // journal entry (date, card, orientation, one-line note) so the
  // timeline and Pattern Mirror can see it. One entry per day, by
  // id; drawing again the same day returns the same card and the
  // same entry.
  const saveDailyEntry = async (state: DailyCardState) => {
    const id = `daily-${state.date}`;
    const existing = getReading(id);
    if (existing) {
      if (existing.note) {
        setReflection(existing.note);
        setReflectionSaved(true);
      }
      return;
    }
    const cardInfo = getCard(state.cardId);
    if (!cardInfo) return;
    const entry = {
      ...makeReading({
        spreadSlug: "daily-card",
        spreadName: "Daily card",
        cards: [{ cardId: state.cardId, reversed: state.reversed, position: "Daily", positionKey: "daily" }],
        interpretation: null,
        aiGenerated: false,
        free: true,
      }),
      id,
    };
    await persistReading(entry);
  };

  useEffect(() => {
    const existing = getDailyCard();
    queueMicrotask(() => {
      if (existing) {
        setDaily(existing);
        setPhase("revealed");
        void saveDailyEntry(existing);
      }
      setPractice(getDailyPracticeDays());
    });
    return () => {
      if (drawTimer.current) clearTimeout(drawTimer.current);
    };
  }, []);

  const reduceMotion = useReducedMotion();

  const draw = () => {
    setPhase("shuffling");
    // A short ritual pause before the card appears.
    if (drawTimer.current) clearTimeout(drawTimer.current);
    drawTimer.current = setTimeout(() => {
      const d = drawSingle();
      const saved = setDailyCard(d.cardId, d.reversed);
      setDaily(saved);
      setPractice(getDailyPracticeDays());
      setPhase("revealed");
      trackDailyCardDrawn();
      void saveDailyEntry(saved);
    }, 1400);
  };

  const saveReflection = async () => {
    if (!daily || !reflection.trim()) return;
    await updateReading(`daily-${daily.date}`, { note: reflection.trim() });
    setReflectionSaved(true);
  };

  const card = daily ? getCard(daily.cardId) : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-12 sm:px-6">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">
        A daily ritual
      </p>
      <h1 className="mt-3 text-center font-display text-5xl text-goldbright sm:text-6xl">
        Your Daily Card
      </h1>
      <p className="mt-4 max-w-md text-center text-cream/75">
        One card, free forever, no questions asked. A small mirror for the day
        ahead.
      </p>
      {practice.total >= 1 && (
        <motion.p
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5 text-sm font-semibold text-goldbright"
        >
          Practiced {practice.total} {practice.total === 1 ? "day" : "days"}
          {practice.last30 !== practice.total && ` · ${practice.last30} in the last 30 days`}
        </motion.p>
      )}

      <div className="mt-10 flex min-h-[24rem] w-full flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          {phase === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center"
            >
              <TarotCard cardId={null} size="lg" disabled />
              <StarBorder radius="1rem" className="mt-8" animated>
                <HoldButton
                  size="lg"
                  holdTime={1200}
                  backgroundColor={siteTheme === "light" ? "#ffffff" : "#1a1f2e"}
                  fillColor="#d4af37"
                  textColor={siteTheme === "light" ? "#1c1a15" : "#ede6d6"}
                  fillTextColor="#0a0e1a"
                  doneLabel="Casting…"
                  onHold={draw}
                >
                  Hold to draw today&apos;s card
                </HoldButton>
              {/* Phase 3 (3.8): one draw action only. The hold button
                  is the single trigger (keyboard-operable: hold Space
                  or Enter, with a screen-reader hint). The second
                  "Prefer a tap? Draw now" trigger competed with it
                  and is deleted; tap-the-card is Phase 4's call. */}
              </StarBorder>
            </motion.div>
          )}

          {phase === "shuffling" && (
            <motion.div
              key="shuffling"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center"
              aria-live="polite"
            >
              <motion.div
                animate={{ rotate: [0, -4, 4, -3, 3, 0], y: [0, -10, 0] }}
                transition={{ duration: 1.3, ease: "easeInOut" }}
              >
                <TarotCard cardId={null} size="lg" disabled />
              </motion.div>
              <p className="mt-8 font-display text-2xl italic text-goldbright">
                The lots are being cast…
              </p>
            </motion.div>
          )}

          {phase === "revealed" && card && daily && (
            <motion.div
              key="revealed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex w-full flex-col items-center"
            >
              {/* Deep UX Batch A2, doc item 10: PixelTransition is
                  replaced on the daily reveal only with a Motion
                  flip reveal, card back to face, gold only. Reduced
                  motion renders the face statically. */}
              <motion.div
                style={{ perspective: 800, width: 220 }}
                initial={reduceMotion ? false : { opacity: 0, rotateY: -90, scale: 0.98 }}
                animate={{ opacity: 1, rotateY: 0, scale: 1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              >
                <button
                  type="button"
                  onClick={() => setZoomOpen(true)}
                  aria-label={`Enlarge ${card.name}`}
                  className="block h-full w-full cursor-pointer rounded-[22px] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  <span className={daily.reversed ? "block rotate-180" : "block"}>
                    <HoloCard
                      image={card.image}
                      alt={card.name}
                      preset="gold"
                      foilColor="#d4af37"
                      width={220}
                      radius={22}
                    />
                  </span>
                </button>
              </motion.div>
              <p className="mt-3 text-xs text-mist">
                {daily.reversed ? "Reversed" : "Upright"} · Tap the card to enlarge it.
              </p>
              {zoomOpen && (
                <CardModal cardId={daily.cardId} onClose={() => setZoomOpen(false)} />
              )}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.6 }}
                className="mt-8 w-full rounded-3xl border border-gold/25 bg-panel/70 p-6 text-center sm:p-8"
              >
                <h2 className="font-display text-4xl text-goldbright">
                  {card.name}
                </h2>
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  {orientationKeywords(card, daily.reversed).map((k) => (
                    <span
                      key={k}
                      className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs text-goldbright"
                    >
                      {k}
                    </span>
                  ))}
                </div>
                {/* Phase 2, 2.2: the meaning used to type itself out
                    with fake typos, and "Show full meaning now"
                    swapped the component mid-type, which truncated
                    it mid-word ("...De|"). The full meaning now
                    renders at once with a dignified fade-in; there
                    is no partial state left to skip from. */}
                <motion.p
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="mx-auto mt-5 max-w-lg leading-relaxed text-cream/90"
                >
                  {orientationMeaning(card, daily.reversed)}
                </motion.p>
                <p className="mt-6 text-xs italic text-mist">
                  A reflection for today, not a prediction. Come back tomorrow
                  for a new card.
                </p>
                {/* Phase E (item 6): evening return. One line on where
                    the card&apos;s quality showed up today, saved as
                    the note on today&apos;s journal entry. */}
                <div className="mt-6 rounded-2xl border border-gold/25 bg-navydeep/50 p-4 text-left">
                  <label htmlFor="daily-reflection" className="text-sm font-semibold text-goldbright">
                    Evening return
                  </label>
                  <p className="mt-1 text-sm text-cream/75">
                    Where did this card&apos;s quality show up today?
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      id="daily-reflection"
                      type="text"
                      value={reflection}
                      onChange={(e) => {
                        setReflection(e.target.value);
                        setReflectionSaved(false);
                      }}
                      maxLength={300}
                      placeholder="One line is enough."
                      className="min-w-0 flex-1 rounded-xl border border-gold/30 bg-navy px-3 py-2 text-sm text-cream placeholder:text-mist"
                    />
                    <button
                      type="button"
                      onClick={saveReflection}
                      disabled={!reflection.trim()}
                      className="rounded-xl border border-gold/40 px-4 py-2 text-sm font-bold text-goldbright disabled:opacity-50"
                    >
                      Save to journal
                    </button>
                  </div>
                  {reflectionSaved && (
                    <p className="mt-2 text-sm text-cream/70">Saved to your journal.</p>
                  )}
                </div>
                {/* Personal Phase 3: a revealed daily card used to end
                    here. Give the user one obvious next step now,
                    not only tomorrow. Links only, no logic change. */}
                <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link
                    href="/spreads/quick-insight"
                    className="btn-gold rounded-xl px-6 py-3 font-bold"
                  >
                    Ask a full reading about this
                  </Link>
                  <Link
                    href="/deck"
                    className="btn-ghost rounded-xl px-6 py-3 font-semibold"
                  >
                    Explore all card meanings
                  </Link>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
