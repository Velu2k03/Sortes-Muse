"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MAJORS } from "@/lib/cards";
import ThemedDatePicker from "@/components/ThemedDatePicker";

// Birth card calculator, calculated in memory only. The date you enter
// is never stored, never sent to a server, and never sent to AI.
// Method, stated on the page: add all digits of the birth date, then
// keep adding the digits of the result until the total is 22 or less.
// That total maps to a Major Arcana card: 1 is The Magician through
// 21 is The World, and 22 is The Fool. This is a reflection tool,
// not a prediction and not a personal reading.
function birthCardNumber(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  let total = date.replaceAll("-", "").split("").reduce((s, ch) => s + Number(ch), 0);
  while (total > 22) {
    total = String(total).split("").reduce((s, ch) => s + Number(ch), 0);
  }
  return total;
}

export default function BirthCardPage() {
  const [date, setDate] = useState("");
  // Future dates are not birth dates: show a plain inline message and
  // no card, instead of silently calculating a card for 2099. The
  // YYYY-MM-DD string compares correctly, so no date library is needed.
  const todayKey = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }, []);
  const isFuture = date !== "" && date > todayKey;
  const num = useMemo(() => (isFuture ? null : birthCardNumber(date)), [date, isFuture]);
  const card = useMemo(() => {
    if (num === null) return null;
    const cardNumber = num % 22;
    return MAJORS.find((c) => c.number === cardNumber) ?? null;
  }, [num]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-gold">Calculator</p>
        <h1 className="mt-3 font-display text-5xl text-goldbright sm:text-6xl">Your birth card</h1>
        <p className="mx-auto mt-4 max-w-xl text-cream/75">
          One Major Arcana card from your birth date, calculated in your
          browser. Nothing is stored or sent anywhere. A reflection tool,
          not a prediction.
        </p>
      </div>
      <div className="mx-auto mt-8 rounded-3xl border border-gold/25 bg-panel/70 p-6">
        <label htmlFor="birth-card-date" className="mb-1.5 block text-sm font-medium text-cream">
          Birth date
        </label>
        <ThemedDatePicker id="birth-card-date" value={date} onChange={setDate} />
        {isFuture && (
          <p role="alert" className="mt-3 text-sm font-semibold text-goldbright">
            Please choose a date in the past. A birth date cannot be in the future.
          </p>
        )}
        <p className="mt-3 text-sm text-cream/70">
          Method: add the digits of your birth date; if the total is
          over 22, add the digits of that total, and repeat until it
          is 22 or less (22 is The Fool). Pick a date and your card
          appears below, no button needed.
        </p>
      </div>
      {card && num !== null && (
        <article className="mt-6 rounded-3xl border border-gold/25 bg-panel/70 p-6">
          <p className="text-xs uppercase tracking-[0.25em] text-gold">
            Total {num} · {card.name}
          </p>
          <h2 className="mt-3 font-display text-4xl text-goldbright">{card.name}</h2>
          <p className="mt-3 leading-relaxed text-cream/85">{card.meaning.upright}</p>
          <p className="mt-3 text-sm text-cream/70">
            Keywords: {card.keywords.upright.join(", ")}.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/deck" className="btn-gold">
              Browse the deck
            </Link>
            <Link href="/spreads" className="btn-secondary">
              Get a reading
            </Link>
          </div>
        </article>
      )}
    </div>
  );
}
