"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { dailyHoroscope, weeklyHoroscope, SUN_SIGNS, type SunSign } from "@/lib/daily";
import Icon from "@/components/Icon";
import ThemedDatePicker from "@/components/ThemedDatePicker";
import OptionWheel from "@/components/OptionWheel";
import TextType from "@/components/TextType";
import AnimatedContent from "@/components/AnimatedContent";
import RubberSegment from "@/components/RubberSegment";
import { ClickSpark, StarBorder } from "@/components/ReactBits";

// Daily sun-sign horoscope. Text is written in-house for Sortes, dated,
// and clearly labelled as a general reflection, not a personal reading
// and not a prediction. No external horoscope API is used: aztro was
// checked live on 2026-11-01 and did not respond from this environment,
// and its text is generic sun-sign copy. This page is free, unsaved,
// and uncharged, and it does not ask for any birth data.
//
// Phase A reveal: the user picks a sign and a date, taps Reveal, and the
// result appears with a TextType sign line and a rise animation body.
// Phase B adds a short unveiling beat (1200ms, wait-and-reward pacing
// Velu allowed 2026-11-04). The beat is presentation only: the text is
// local and already computed, and the status line says unveiling, never
// calculating. Under reduced motion the reveal is instant. Changing the
// sign, date, or view resets to unrevealed.
const MODULE_TODAY = new Date();
const MODULE_TODAY_KEY = `${MODULE_TODAY.getFullYear()}-${String(MODULE_TODAY.getMonth() + 1).padStart(2, "0")}-${String(MODULE_TODAY.getDate()).padStart(2, "0")}`;

export default function HoroscopePage() {
  const todayKey = MODULE_TODAY_KEY;
  const [sign, setSign] = useState<SunSign>("Aries");
  const [date, setDate] = useState(todayKey);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const [view, setView] = useState<"daily" | "weekly">("daily");
  // OptionWheel takes hard colours, so it bypasses the theme tokens
  // like the credits Counter and charts dials did. Track the
  // document theme here. RubberSegment now follows the theme too,
  // 2026-11-04, instead of keeping its dark track in light mode.
  const [siteTheme, setSiteTheme] = useState<"dark" | "light">("light");
  useEffect(() => {
    const sync = () =>
      setSiteTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  const [revealed, setRevealed] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
    },
    [],
  );
  const resetReveal = () => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    setRevealed(false);
    setRevealing(false);
  };
  const handleReveal = () => {
    if (reducedMotion) {
      setRevealed(true);
      return;
    }
    setRevealing(true);
    revealTimer.current = setTimeout(() => {
      setRevealing(false);
      setRevealed(true);
    }, 1200);
  };
  const h = dailyHoroscope(sign, date || todayKey);
  const w = weeklyHoroscope(sign, date || todayKey);
  const signLine = view === "daily" ? `${h.sign} · ${h.date}` : `${w.sign} · Week starting ${w.weekStart}`;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="text-center">
        <p className="flex items-center justify-center gap-2 text-xs uppercase tracking-[0.35em] text-gold"><Icon name="iconoirSun" size={18} />Daily Horoscope</p>
        <h1 className="mt-3 font-display text-5xl text-goldbright sm:text-6xl">Today&apos;s sun-sign reflection</h1>
        <p className="mx-auto mt-4 max-w-xl text-cream/75">
          A general reflection for your sun sign, written for Sortes. It is not a personal reading, not a prediction,
          and it never replaces professional advice. Free, unsaved, and no birth data needed.
        </p>
      </div>
      <div className="mx-auto mt-8 grid gap-4 rounded-3xl border border-gold/25 bg-panel/70 p-6 sm:grid-cols-2">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-cream">
            Sun sign
          </span>
          {reducedMotion ? (
            <select
              id="horoscope-sign"
              value={sign}
              onChange={(e) => { setSign(e.target.value as SunSign); resetReveal(); }}
              className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream focus:border-gold/60 focus:outline-none"
            >
              {SUN_SIGNS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            <div className="h-64">
              <p className="mb-2 text-xs text-mist">Drag the wheel, or focus it and use arrow keys to choose a sign.</p>
              <OptionWheel
                items={[...SUN_SIGNS]}
                defaultSelected={SUN_SIGNS.indexOf(sign)}
                onChange={(index) => { setSign(SUN_SIGNS[index]); resetReveal(); }}
                textColor={siteTheme === "light" ? "#45423c" : "#9ca3af"}
                activeColor={siteTheme === "light" ? "#7c5e00" : "#f4d03f"}
              />
            </div>
          )}
        </div>
        <div>
          <label htmlFor="horoscope-date" className="mb-1.5 block text-sm font-medium text-cream">
            Date
          </label>
          <ThemedDatePicker id="horoscope-date" value={date} onChange={(d) => { setDate(d); resetReveal(); }} />
        </div>
      </div>
      <div className="mt-8 flex justify-center">
        <RubberSegment
          items={[
            { value: "daily", label: "Daily" },
            { value: "weekly", label: "Weekly" },
          ]}
          value={view}
          onChange={(v) => { setView(v as "daily" | "weekly"); resetReveal(); }}
          aria-label="Daily or weekly"
          trackColor={siteTheme === "light" ? "#ffffff" : "#1a1f2e"}
          thumbColor="#d4af37"
          textColor={siteTheme === "light" ? "#45423c" : "#9ca3af"}
          activeTextColor="#0a0e1a"
          className={siteTheme === "light" ? "ring-1 ring-gold/25" : ""}
        />
      </div>
      <div className="mt-8 text-center">
        {!revealed && !revealing && (
          <StarBorder radius="1rem">
            <ClickSpark>
              <button
                type="button"
                onClick={handleReveal}
                className="btn-gold rounded-2xl px-8 py-3.5 text-lg font-bold"
              >
                {view === "daily" ? "Reveal Today's Horoscope" : "Reveal This Week's Horoscope"}
              </button>
            </ClickSpark>
          </StarBorder>
        )}
      </div>
      {revealing ? (
        <p className="mt-6 animate-pulse text-center text-sm text-gold">
          Unveiling your reflection…
        </p>
      ) : !revealed ? (
        <p className="mt-6 text-center text-sm text-cream/60">
          Choose your sign and date, then reveal your reflection. Nothing is charged, and nothing is saved.
        </p>
      ) : (
        <article className="mt-6 rounded-3xl border border-gold/25 bg-panel/70 p-6">
          {reducedMotion ? (
            <p className="text-xs uppercase tracking-[0.25em] text-gold">
              {signLine}
            </p>
          ) : (
            <TextType
              text={signLine}
              className="text-xs uppercase tracking-[0.25em] text-gold"
              deletingSpeed={35}
              pauseDuration={2200}
              typeEffect="fade"
              cursorStyle="bar"
              cursorCharacter="●"
              cursorBlinkDuration={0.55}
              mistakes={0.55}
              variableSpeed={{ min: 40, max: 170 }}
              loop={false}
            />
          )}
          {reducedMotion ? (
            <>
              <p className="mt-3 text-lg leading-relaxed text-cream">{view === "daily" ? h.theme : w.theme}</p>
              <p className="mt-3 leading-relaxed text-cream/85">{view === "daily" ? h.reflection : w.reflection}</p>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-cream/80">
                <span>
                  Playful pick: <strong className="text-cream">{view === "daily" ? h.luckyColour : w.luckyColour}</strong>
                  {" · "}
                  <strong className="num text-cream">{view === "daily" ? h.luckyNumber : w.luckyNumber}</strong>
                </span>
              </div>
            </>
          ) : (
            <AnimatedContent trigger="mount" wipe="up" blur={10} distance={60} duration={0.8} scale={0.98} threshold={0.2} stagger={0.08}>
              <p className="mt-3 text-lg leading-relaxed text-cream">{view === "daily" ? h.theme : w.theme}</p>
              <p className="mt-3 leading-relaxed text-cream/85">{view === "daily" ? h.reflection : w.reflection}</p>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-cream/80">
                <span>
                  Playful pick: <strong className="text-cream">{view === "daily" ? h.luckyColour : w.luckyColour}</strong>
                  {" · "}
                  <strong className="num text-cream">{view === "daily" ? h.luckyNumber : w.luckyNumber}</strong>
                </span>
              </div>
            </AnimatedContent>
          )}
          <p className="mt-4 text-sm text-cream/60">
            General sun-sign reflection only. For a personal reading, draw a card or cast a birth chart.
          </p>
          <p className="mt-3 text-sm text-cream/75">
            Want transits computed from your own chart?{" "}
            <Link href="/charts" className="font-semibold text-goldbright underline">
              Cast a Western chart
            </Link>{" "}
            and open Today&apos;s transits to this chart under the wheel. That view uses real
            planetary positions matched to your natal planets; this page does not.
          </p>
        </article>
      )}
    </div>
  );
}
