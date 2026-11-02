"use client";

import { useState } from "react";
import { dailyHoroscope, weeklyHoroscope, SUN_SIGNS, type SunSign } from "@/lib/daily";
import Icon from "@/components/Icon";

// Daily sun-sign horoscope. Text is written in-house for Sortes, dated,
// and clearly labelled as a general reflection, not a personal reading
// and not a prediction. No external horoscope API is used: aztro was
// checked live on 2026-11-01 and did not respond from this environment,
// and its text is generic sun-sign copy. This page is free, unsaved,
// and uncharged, and it does not ask for any birth data.
const MODULE_TODAY = new Date();
const MODULE_TODAY_KEY = `${MODULE_TODAY.getFullYear()}-${String(MODULE_TODAY.getMonth() + 1).padStart(2, "0")}-${String(MODULE_TODAY.getDate()).padStart(2, "0")}`;

export default function HoroscopePage() {
  const todayKey = MODULE_TODAY_KEY;
  const [sign, setSign] = useState<SunSign>("Aries");
  const [date, setDate] = useState(todayKey);
  const [view, setView] = useState<"daily" | "weekly">("daily");
  const h = dailyHoroscope(sign, date || todayKey);
  const w = weeklyHoroscope(sign, date || todayKey);

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
          <label htmlFor="horoscope-sign" className="mb-1.5 block text-sm font-medium text-cream">
            Sun sign
          </label>
          <select
            id="horoscope-sign"
            value={sign}
            onChange={(e) => setSign(e.target.value as SunSign)}
            className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream focus:border-gold/60 focus:outline-none"
          >
            {SUN_SIGNS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="horoscope-date" className="mb-1.5 block text-sm font-medium text-cream">
            Date
          </label>
          <input
            id="horoscope-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream focus:border-gold/60 focus:outline-none"
          />
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
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={`rubber-segment__button relative z-10 flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${view === v ? "text-goldbright" : "text-mist hover:text-cream"}`}
          >
            {v === "daily" ? "Daily" : "Weekly"}
          </button>
        ))}
      </div>
      <article className="mt-6 rounded-3xl border border-gold/25 bg-panel/70 p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-gold">
          {view === "daily" ? `${h.sign} · ${h.date}` : `${w.sign} · Week starting ${w.weekStart}`}
        </p>
        <p className="mt-3 text-lg leading-relaxed text-cream">{view === "daily" ? h.theme : w.theme}</p>
        <p className="mt-3 leading-relaxed text-cream/85">{view === "daily" ? h.reflection : w.reflection}</p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-cream/80">
          <span>
            Lucky colour: <strong className="text-cream">{view === "daily" ? h.luckyColour : w.luckyColour}</strong>
          </span>
          <span>
            Lucky number: <strong className="num text-cream">{view === "daily" ? h.luckyNumber : w.luckyNumber}</strong>
          </span>
        </div>
        <p className="mt-4 text-sm text-cream/60">
          General sun-sign reflection only. For a personal reading, draw a card or cast a birth chart.
        </p>
      </article>
    </div>
  );
}
