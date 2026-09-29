"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getReading } from "@/lib/storage";
import type { Reading } from "@/lib/types";
import { getCard, orientationKeywords, orientationMeaning } from "@/lib/cards";
import TarotCard from "@/components/TarotCard";
import ShareReading from "@/components/ShareReading";

/**
 * Reading detail: full cards + interpretation + share + "Ask a follow-up" upsell.
 */
export default function ReadingDetail({ id }: { id: string }) {
  const [reading, setReading] = useState<Reading | null | undefined>(undefined);

  useEffect(() => {
    setReading(getReading(id) ?? null);
  }, [id]);

  if (reading === undefined) {
    return <p className="py-20 text-center text-mist">Loading…</p>;
  }

  if (reading === null) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="font-display text-4xl text-goldbright">Reading not found</h1>
        <p className="mt-4 text-cream/75">
          This reading is not in your journal on this device.
        </p>
        <Link href="/spreads" className="btn-gold mt-8 inline-block rounded-xl px-8 py-3 font-bold">
          Begin a new reading
        </Link>
      </div>
    );
  }

  const date = new Date(reading.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="text-center text-xs uppercase tracking-[0.35em] text-gold">
        {reading.spreadName} · {date}
      </p>
      <h1 className="mt-3 text-center font-display text-5xl text-goldbright">
        Your reading
      </h1>
      {reading.question && (
        <p className="mx-auto mt-4 max-w-xl text-center italic text-cream/80">
          “{reading.question}”
        </p>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-4">
        {reading.cards.map((d) => (
          <TarotCard
            key={d.positionKey}
            cardId={d.cardId}
            reversed={d.reversed}
            revealed
            size="sm"
            label={d.position}
          />
        ))}
      </div>

      <div className="mx-auto mt-10 max-w-3xl space-y-5">
        {reading.cards.map((d, i) => {
          const card = getCard(d.cardId);
          return (
            <section
              key={d.positionKey}
              className="rounded-3xl border border-gold/20 bg-panel/60 p-6"
            >
              <p className="text-xs uppercase tracking-[0.25em] text-gold">
                {i + 1} · {d.position}
              </p>
              <h2 className="mt-1 font-display text-2xl text-cream">
                {card.name}{" "}
                <span className="text-sm font-body font-normal text-mist">
                  {d.reversed ? "reversed" : "upright"}
                </span>
              </h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {orientationKeywords(card, d.reversed).map((k) => (
                  <span
                    key={k}
                    className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs text-goldbright"
                  >
                    {k}
                  </span>
                ))}
              </div>
              <p className="mt-3 leading-relaxed text-cream/90">
                {reading.aiGenerated && reading.interpretation
                  ? null
                  : orientationMeaning(card, d.reversed)}
              </p>
            </section>
          );
        })}

        {reading.aiGenerated && reading.interpretation && (
          <section className="rounded-3xl border border-gold/30 bg-navydeep/70 p-6 sm:p-8">
            <p className="text-xs uppercase tracking-[0.25em] text-gold">
              Personalized interpretation
            </p>
            <div className="mt-3 whitespace-pre-line leading-relaxed text-cream/90">
              {reading.interpretation}
            </div>
          </section>
        )}
      </div>

      <div className="mx-auto mt-10 flex max-w-3xl flex-col items-center gap-4 rounded-3xl border border-gold/25 bg-panel/60 p-6 text-center sm:p-8">
        <ShareReading
          spreadName={reading.spreadName}
          drawn={reading.cards}
          date={reading.createdAt}
        />
        <div className="rule-gold w-24" />
        <p className="font-display text-2xl text-cream">Still turning it over?</p>
        <p className="max-w-md text-sm text-cream/75">
          Ask a follow-up and draw a clarifying reading on the same question,
          with your story carried forward.
        </p>
        <Link
          href="/spreads/quick-insight"
          className="btn-gold rounded-xl px-8 py-3 font-bold"
        >
          Ask a follow-up · 1 credit
        </Link>
      </div>

      <p className="mx-auto mt-8 max-w-md text-center text-xs italic leading-relaxed text-mist/80">
        For reflection and perspective, not guaranteed predictions.
      </p>
    </div>
  );
}
