"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "motion/react";
import { useCanHide } from "@/lib/use-mounted";
import { getCard } from "@/lib/cards";

const SAMPLE_CARDS = [
  { id: "wands-02", position: "Past", note: "The crossroads behind you" },
  { id: "major-07", position: "Present", note: "The will to move" },
  { id: "major-17", position: "Future", note: "The star you steer by" },
];

export const SAMPLE_INTERPRETATION = `Maya, your cards are not arguing with each other. They are telling one story in three beats, and the story is about a decision you have already made in every way except out loud.

The Two of Wands in the Past shows the exact crossroads you described: the safe path you have already mastered, and the wilder one you keep looking at. You have been standing at that window a long time, and the card honors it. Planning is not the same as stalling. You mapped the risks, you priced the leap, you asked everyone you trust. That work counts. But the card is also honest about what it shows: a figure holding the world in one hand and looking out to sea. The planning phase is complete. What remains is not more information. It is a choice.

The Chariot arrives in the Present with unusual force for you. This is the card of taking the reins, and it is upright, which matters. The way forward is not reckless. It is directed. The startup offer is the chariot itself. Fast, a little frightening, and pointed somewhere. Two horses pull in different directions on this card, and the driver does not resolve that tension by picking one horse. He holds both reins. That is the skill this moment asks of you: not certainty, but steering. You can want the stability of the old job and the aliveness of the new one at the same time, and still move.

And then The Star in the Future, the card of quiet, certain hope. Not fireworks, Maya. A steady light. This is the card that appears when the path is right but the timing asks for trust. The real question was never whether you are ready. You are. The question was whether you would let yourself want it.

What stands out most is how little fear is actually in these cards. There is no Tower here, no Ten of Swords. The fear lives in the story around the cards, not in the cards themselves. The tension is between the part of you that has already decided and the part that wants one more sign. The opportunity is that the decision does not need to be dramatic to be real. A quiet yes counts the same as a loud one.

What you may be overlooking is the cost of staying. You have priced the leap carefully and never priced the standstill. Another year in the mastered role is not neutral. It is a year of the same window, the same looking out to sea.

One practical step: this week, tell one person the answer out loud. Not the pros and cons. The answer. Say, I am taking the offer, or I am staying, and listen to what your body does when the words leave your mouth. That reaction is information your spreadsheets cannot give you.

What would change if you trusted that the steadiness of The Star is already yours, and the only thing left is to walk toward it?`;

/**
 * Sample personalized reading on the home page: shows visitors exactly
 * what they are buying before any paywall. Clearly labeled as a sample.
 * Phase E (item 9): a full paid-style reading, 505 words in the
 * 350-550 band, with the same closing structure as a real reading
 * (what stands out, tension and opportunity, what is overlooked, one
 * practical step, exactly one reflection question). The word count
 * and structure are pinned in sample-reading.test.ts.
 *
 * AF-034: `collapsed` hides the full 505-word sample behind a
 * <details> on the homepage diet, so the page shows the heading and
 * one tap instead of the whole reading. /oracles keeps the full
 * version (collapsed=false).
 */
export default function SampleReading({ collapsed = false }: { collapsed?: boolean }) {
  const hide = useCanHide();
  const revealKey = hide ? "reveal" : "static";
  const body = (
    <motion.div
      key={`${revealKey}-b`}
      initial={hide ? { opacity: 0, y: 24 } : false}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
      className={
        collapsed
          ? "overflow-hidden border-t border-gold/15 bg-panel/70"
          : "mt-10 overflow-hidden rounded-3xl border border-gold/25 bg-panel/70"
      }
    >
      <div className="flex items-center justify-between border-b border-gold/15 px-6 py-4">
        <p className="text-xs uppercase tracking-[0.25em] text-mist">
          Past · Present · Future
        </p>
        <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-goldbright">
          Sample reading
        </span>
      </div>

      <div className="flex flex-wrap items-start justify-center gap-5 px-6 pt-8">
        {SAMPLE_CARDS.map((s) => {
          const card = getCard(s.id);
          return (
            <div key={s.id} className="flex flex-col items-center gap-2">
              <div className="relative h-40 w-24 overflow-hidden rounded-xl border border-gold/40 shadow-[0_8px_30px_rgba(0,0,0,0.6)] sm:h-48 sm:w-28">
                <Image
                  src={card.image}
                  alt={card.name}
                  fill
                  sizes="112px"
                  className="object-cover"
                />
              </div>
              <p className="text-xs uppercase tracking-[0.2em] text-gold">
                {s.position}
              </p>
              <p className="font-display text-sm text-cream">{card.name}</p>
              <p className="max-w-[8rem] text-center text-xs italic text-mist">
                {s.note}
              </p>
            </div>
          );
        })}
      </div>

      <div className="px-6 py-8 sm:px-10">
        <p className="text-center text-sm italic text-cream/75">
          “Should I take the new job offer, or stay where I am?”
        </p>
        <div className="mx-auto mt-6 max-w-2xl whitespace-pre-line text-[15px] leading-relaxed text-cream/90">
          {SAMPLE_INTERPRETATION}
        </div>
      </div>

      <div className="border-t border-gold/15 px-6 py-6 text-center sm:px-10">
        <Link
          href="/spreads/past-present-future"
          className="btn-gold mt-4 inline-block rounded-2xl px-8 py-3.5 font-bold"
        >
          Get my reading · 1 Oracle
        </Link>
        <p className="mt-3 text-xs text-mist">
          Your first Quick Insight reading is free.
        </p>
        <p className="mt-1 text-xs text-mist">
          Real readings are written by AI from your cards, question, and
          story — 300-600 words, on screen in up to about 3 minutes.
        </p>
      </div>
    </motion.div>
  );
  return (
    <section className="border-y border-gold/10 bg-navydeep/40 py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <motion.div
          key={`${revealKey}-a`}
          initial={hide ? { opacity: 0, y: 24 } : false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center"
        >
          <p className="text-xs uppercase tracking-[0.35em] text-gold">
            Sample reading
          </p>
          <h2 className="mt-4 font-display text-4xl text-goldbright sm:text-5xl">
            See what a personalized reading feels like
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-cream/75">
            An invented example: Maya&apos;s question, answered the way yours
            will be. Yours is written around your own story and question.
          </p>
        </motion.div>

        {collapsed ? (
          <details className="mt-10 overflow-hidden rounded-3xl border border-gold/25 bg-panel/70">
            <summary className="cursor-pointer px-6 py-4 text-center font-semibold text-goldbright">
              Read the full sample reading
            </summary>
            {body}
          </details>
        ) : (
          body
        )}
      </div>
    </section>
  );
}
