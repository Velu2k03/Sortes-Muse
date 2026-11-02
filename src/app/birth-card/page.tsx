"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MAJORS } from "@/lib/cards";

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
  const num = useMemo(() => birthCardNumber(date), [date]);
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
          One Major Arcana card from your birth date, calculated here in your
          browser. The date is never stored, never sent to a server, and never
          sent to AI. A reflection tool, not a prediction.
        </p>
      </div>
      <div className="mx-auto mt-8 rounded-3xl border border-gold/25 bg-panel/70 p-6">
        <label htmlFor="birth-card-date" className="mb-1.5 block text-sm font-medium text-cream">
          Birth date
        </label>
        <input
          id="birth-card-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-base text-cream focus:border-gold/60 focus:outline-none"
        />
        <p className="mt-3 text-sm text-cream/70">
          Method: add all digits of the date, then keep adding the digits of
          the result until the total is 22 or less. 1 is The Magician through
          21 is The World, and 22 is The Fool.
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
      <p className="mt-8 text-center text-sm text-mist">
        General reflection only. For a personal reading, draw a card or cast a birth chart.
      </p>
    </div>
  );
}
