"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getCard, orientationMeaning } from "@/lib/cards";
import { getDailyCard, type DailyCardState } from "@/lib/storage";

// Remodel Phase 1 batch 2 (Velu, 2026-11-14): today's card as the
// sample reading, directly below the hero. One card, one line, clearly
// labelled as a sample so a visitor knows this is an example of what
// a reading looks like.
//
// The card is the existing daily card, reused, not a new picker: the
// /daily route draws one card per day and stores it in localStorage
// (getDailyCard/setDailyCard), so a visitor who already drew today
// sees their own card here. There is no date-seeded deterministic
// pick in the repo — the draw is a per-device random draw stored for
// the day — so a visitor who has not drawn yet sees the plan's fixed
// example instead: The Star with the plan's example line. Nothing is
// drawn or stored here; drawing stays on /daily.
const SAMPLE_CARD_ID = "major-17";
const SAMPLE_LINE =
  "A new beginning is closer than you think. Take the small step today.";

// A card meaning is a short paragraph; the sample shows its first
// sentence only, so the reading stays one line.
function firstSentence(text: string): string {
  const match = text.match(/^.*?[.!?](?=\s|$)/);
  return match ? match[0] : text;
}

export default function TodaySample() {
  const [daily, setDaily] = useState<DailyCardState | null>(null);
  useEffect(() => {
    // ReturnLoop pattern: read localStorage in a microtask past the
    // effect. The fixed example renders on the server and on first
    // paint (Codex P2, PR #84: JS-disabled visitors and crawlers
    // otherwise never see the sample), then the stored daily card
    // swaps in after hydration if the visitor drew one today.
    queueMicrotask(() => {
      setDaily(getDailyCard());
    });
  }, []);

  const card = daily ? getCard(daily.cardId) : getCard(SAMPLE_CARD_ID);
  const line = daily
    ? firstSentence(orientationMeaning(card, daily.reversed))
    : SAMPLE_LINE;

  return (
    <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6" aria-label="Sample reading">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">
        Sample reading
      </p>
      <h2 className="mt-4 font-display text-4xl text-goldbright sm:text-5xl">
        Today&apos;s card
      </h2>
      <p className="mx-auto mt-4 max-w-lg text-cream/75">
        One card, one line — an example of what a reading looks like.
      </p>
      <div className="mt-8 flex flex-col items-center">
        <div className="relative h-48 w-28 overflow-hidden rounded-xl border border-gold/40 shadow-[0_8px_30px_rgba(0,0,0,0.6)] sm:h-56 sm:w-32">
          <Image
            src={card.image}
            alt={card.name}
            fill
            sizes="128px"
            className="object-cover"
          />
        </div>
        <p className="mt-4 font-display text-2xl text-goldbright">
          {card.name}
          {daily?.reversed ? " (Reversed)" : ""}
        </p>
        {daily && (
          <p className="mt-1 text-xs text-mist">You drew this card today.</p>
        )}
        <p className="mx-auto mt-3 max-w-md text-base italic leading-relaxed text-cream/85">
          &ldquo;{line}&rdquo;
        </p>
        <Link
          href="/daily"
          className="btn-ghost mt-6 inline-block rounded-2xl px-8 py-3.5 font-semibold"
        >
          Draw today&apos;s card
        </Link>
      </div>
    </section>
  );
}
