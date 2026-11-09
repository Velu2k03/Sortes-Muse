"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MAJORS } from "@/lib/cards";
import { birthCardNumbers } from "@/lib/birth-card";
import ThemedDatePicker from "@/components/ThemedDatePicker";

// Birth card calculator, calculated in memory only. The date you enter
// is never stored, never sent to a server, and never sent to AI.
// Method, stated on the page: add all digits of the birth date, then
// keep adding the digits of the result until the total is 22 or less.
// That total is the Personality card (22 is The Fool). Add the digits
// of the Personality number until a single digit remains: that is the
// Soul card. This is the traditional Personality & Soul pair, a
// reflection tool, not a prediction and not a personal reading.
function cardForNumber(n: number) {
  // Personality 22 is The Fool, numbered 0 in the deck data.
  const cardNumber = n % 22;
  return MAJORS.find((c) => c.number === cardNumber) ?? null;
}

export default function BirthCardPage() {
  const [date, setDate] = useState("");
  // Future dates are not birth dates: show a plain inline message and
  // no card, instead of silently calculating a card for 2099. The
  // YYYY-MM-DD string compares correctly, so no date library is needed.
  const [todayKey] = useState(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  });
  const isFuture = date !== "" && date > todayKey;
  const pair = useMemo(() => (isFuture ? null : birthCardNumbers(date)), [date, isFuture]);
  const personalityCard = useMemo(
    () => (pair === null ? null : cardForNumber(pair.personality)),
    [pair]
  );
  const soulCard = useMemo(
    () => (pair === null ? null : cardForNumber(pair.soul)),
    [pair]
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-gold">Calculator</p>
        <h1 className="mt-3 font-display text-5xl text-goldbright sm:text-6xl">Your birth card</h1>
        <p className="mx-auto mt-4 max-w-xl text-cream/75">
          Two Major Arcana cards from your birth date, calculated in your
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
            Please choose a date in the past.
          </p>
        )}
        <p className="mt-3 text-sm text-cream/75">
          Method: add the digits of your birth date; if the total is
          over 22, add the digits of that total, and repeat until it
          is 22 or less (22 is The Fool). That is your Personality
          card. Add the digits of the Personality number until a
          single digit remains: that is your Soul card. Pick a date
          and your cards appear below, no button needed.
        </p>
      </div>
      {pair !== null && personalityCard && soulCard && (
        <div className="mt-6">
          <p className="text-center text-sm text-mist">
            Digit total {pair.total} · Personality {pair.personality} · Soul {pair.soul}
          </p>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <article className="rounded-3xl border border-gold/25 bg-panel/70 p-6">
              <p className="text-xs uppercase tracking-[0.25em] text-gold">
                Personality card · {personalityCard.name}
              </p>
              <h2 className="mt-3 font-display text-4xl text-goldbright">{personalityCard.name}</h2>
              <p className="mt-2 text-sm leading-relaxed text-cream/75">
                The Personality card describes how you
                meet the world: the lesson you work with in daily life.
              </p>
              <p className="mt-3 leading-relaxed text-cream/85">{personalityCard.meaning.upright}</p>
              <p className="mt-3 text-sm text-cream/75">
                Keywords: {personalityCard.keywords.upright.join(", ")}.
              </p>
            </article>
            <article className="rounded-3xl border border-gold/25 bg-panel/70 p-6">
              <p className="text-xs uppercase tracking-[0.25em] text-gold">
                Soul card · {soulCard.name}
              </p>
              <h2 className="mt-3 font-display text-4xl text-goldbright">{soulCard.name}</h2>
              <p className="mt-2 text-sm leading-relaxed text-cream/75">
                The Soul card describes the inner lesson behind it: what
                your life keeps teaching you, underneath the day to day.
              </p>
              <p className="mt-3 leading-relaxed text-cream/85">{soulCard.meaning.upright}</p>
              <p className="mt-3 text-sm text-cream/75">
                Keywords: {soulCard.keywords.upright.join(", ")}.
              </p>
            </article>
          </div>
          {pair.personality === pair.soul && (
            <p className="mt-4 text-center text-sm text-cream/75">
              Your Personality and Soul cards are the same card: the
              outer lesson and the inner lesson point the same way.
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/deck" className="btn-gold">
              Browse the deck
            </Link>
            <Link href="/spreads/quick-insight" className="btn-secondary">
              Start a free reading
            </Link>
            <Link href="/spreads" className="btn-secondary">
              Get a reading
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
