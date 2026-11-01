"use client";

import { useState } from "react";
import { dailyHoroscope, SUN_SIGNS, type SunSign } from "@/lib/daily";
import Icon from "@/components/Icon";

// Daily sun-sign horoscope. Text is written in-house for Sortes, dated,
// and clearly labelled as a general reflection, not a personal reading
// and not a prediction. No external horoscope API is used: aztro was
// checked live on 2026-11-01 and did not respond from this environment,
// and its text is generic sun-sign copy. This page is free, unsaved,
// and uncharged, and it does not ask for any birth data.
export default function HoroscopePage() {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [sign, setSign] = useState<SunSign>("Aries");
  const [date, setDate] = useState(todayKey);
  const h = dailyHoroscope(sign, date || todayKey);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="text-center">
        <p className="flex items-center justify-center gap-2 text-xs uppercase tracking-[0.35em] text-gold"><Icon name="sun" size={18} />Daily Horoscope</p>
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
      <article className="mt-6 rounded-3xl border border-gold/25 bg-panel/70 p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-gold">
          {h.sign} · {h.date}
        </p>
        <p className="mt-3 text-lg leading-relaxed text-cream">{h.theme}</p>
        <p className="mt-3 leading-relaxed text-cream/85">{h.reflection}</p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-cream/80">
          <span>
            Lucky colour: <strong className="text-cream">{h.luckyColour}</strong>
          </span>
          <span>
            Lucky number: <strong className="text-cream">{h.luckyNumber}</strong>
          </span>
        </div>
        <p className="mt-4 text-sm text-cream/60">
          General sun-sign reflection only. For a personal reading, draw a card or cast a birth chart.
        </p>
      </article>
    </div>
  );
}
