"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { getCard } from "@/lib/cards";

const SAMPLE_CARDS = [
  { id: "wands-02", position: "Past", note: "The crossroads behind you" },
  { id: "major-07", position: "Present", note: "The will to move" },
  { id: "major-17", position: "Future", note: "The star you steer by" },
];

const SAMPLE_INTERPRETATION = `Maya, your cards are not arguing with each other. They are telling one story in three beats.

The Two of Wands in the Past shows the exact crossroads you described: the safe path you have already mastered, and the wilder one you keep looking at. You have been standing at that window a long time, and the card honors it. Planning is not the same as stalling, but your planning phase is complete.

The Chariot arrives in the Present with unusual force for you. This is the card of taking the reins, and it is upright, which matters: the way forward is not reckless, it is directed. The startup offer is the chariot itself. Fast, a little frightening, and pointed somewhere.

And then The Star in the Future, the card of quiet, certain hope. Not fireworks, Maya. A steady light. This is the card that appears when the path is right but the timing asks for trust. The real question was never whether you are ready. You are. The question was whether you would let yourself want it.

Sit with The Star this week. Notice where your body leans when you picture saying yes.`;

/**
 * Sample personalized reading on the home page: shows visitors exactly
 * what they are buying before any paywall. Clearly labeled as a sample.
 */
export default function SampleReading() {
  return (
    <section className="border-y border-gold/10 bg-navydeep/40 py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center"
        >
          <p className="text-xs uppercase tracking-[0.35em] text-gold">
            A taste of the magic
          </p>
          <h2 className="mt-4 font-display text-4xl text-goldbright sm:text-5xl">
            See what a personalized reading feels like
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-cream/75">
            Every paid reading is woven around{" "}
            <em>your</em> story and your exact question, written for you alone.
            Here is a real example, shared with permission, names changed.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
          className="mt-10 overflow-hidden rounded-3xl border border-gold/25 bg-panel/70"
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
            <p className="text-center text-sm italic text-cream/70">
              “Should I take the new job offer, or stay where I am?”
            </p>
            <div className="mx-auto mt-6 max-w-2xl whitespace-pre-line text-[15px] leading-relaxed text-cream/90">
              {SAMPLE_INTERPRETATION}
            </div>
          </div>

          <div className="border-t border-gold/15 px-6 py-6 text-center sm:px-10">
            <p className="text-sm text-cream/75">
              Yours would be written around <em>your</em> story, your names,
              your exact question.
            </p>
            <Link
              href="/spreads/past-present-future"
              className="btn-gold mt-4 inline-block rounded-2xl px-8 py-3.5 font-bold"
            >
              Get my reading · 1 credit
            </Link>
            <p className="mt-3 text-xs text-mist">
              First full reading is free. No card required.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
