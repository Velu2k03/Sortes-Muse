"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { dailyHoroscope, weeklyHoroscope, SUN_SIGNS, type SunSign } from "@/lib/daily";
import Icon from "@/components/Icon";
import ThemedDatePicker from "@/components/ThemedDatePicker";
import OptionWheel from "@/components/OptionWheel";
import BlurText from "@/components/BlurText";
import FadeContent from "@/components/FadeContent";
import { ClickSpark, StarBorder } from "@/components/ReactBits";

// Daily sun-sign horoscope. Text is written in-house for Sortes, dated,
// and clearly labelled as a general reflection, not a personal reading
// and not a prediction. No external horoscope API is used: aztro was
// checked live on 2026-11-01 and did not respond from this environment,
// and its text is generic sun-sign copy. This page is free, unsaved,
// and uncharged, and it does not ask for any birth data.
//
// Phase A reveal: the reflection is local and instant, so there is no
// loading state and no fake processing. The user picks a sign and a date,
// taps Reveal, and the result appears with a short BlurText sign line and
// a FadeContent body. Under reduced motion the same content renders
// statically. Changing the sign, date, or view resets to unrevealed.
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
  const [revealed, setRevealed] = useState(false);
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
              onChange={(e) => { setSign(e.target.value as SunSign); setRevealed(false); }}
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
              <OptionWheel
                items={[...SUN_SIGNS]}
                defaultSelected={SUN_SIGNS.indexOf(sign)}
                onChange={(index) => { setSign(SUN_SIGNS[index]); setRevealed(false); }}
                textColor="#9ca3af"
                activeColor="#f4d03f"
              />
            </div>
          )}
        </div>
        <div>
          <label htmlFor="horoscope-date" className="mb-1.5 block text-sm font-medium text-cream">
            Date
          </label>
          <ThemedDatePicker id="horoscope-date" value={date} onChange={(d) => { setDate(d); setRevealed(false); }} />
        </div>
      </div>
      <div
        className="rubber-segment mt-8 mx-auto flex w-full max-w-xs justify-center gap-1 rounded-xl border border-gold/25 bg-panel/70 p-1"
        data-active={view}
      >
        {(["daily", "weekly"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => { setView(v); setRevealed(false); }}
            aria-pressed={view === v}
            className={`rubber-segment__button relative z-10 flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${view === v ? "text-goldbright" : "text-mist hover:text-cream"}`}
          >
            {v === "daily" ? "Daily" : "Weekly"}
          </button>
        ))}
      </div>
      <div className="mt-8 text-center">
        {!revealed && (
          <StarBorder radius="1rem">
            <ClickSpark>
              <button
                type="button"
                onClick={() => setRevealed(true)}
                className="btn-gold rounded-2xl px-8 py-3.5 text-lg font-bold"
              >
                {view === "daily" ? "Reveal Today's Horoscope" : "Reveal This Week's Horoscope"}
              </button>
            </ClickSpark>
          </StarBorder>
        )}
      </div>
      {!revealed ? (
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
            <BlurText
              text={signLine}
              trigger="load"
              animateBy="words"
              delay={120}
              stepDuration={0.35}
              className="text-xs uppercase tracking-[0.25em] text-gold"
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
            <FadeContent trigger="mount" effect="fade" stagger={0.08}>
              <p className="mt-3 text-lg leading-relaxed text-cream">{view === "daily" ? h.theme : w.theme}</p>
              <p className="mt-3 leading-relaxed text-cream/85">{view === "daily" ? h.reflection : w.reflection}</p>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-cream/80">
                <span>
                  Playful pick: <strong className="text-cream">{view === "daily" ? h.luckyColour : w.luckyColour}</strong>
                  {" · "}
                  <strong className="num text-cream">{view === "daily" ? h.luckyNumber : w.luckyNumber}</strong>
                </span>
              </div>
            </FadeContent>
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
