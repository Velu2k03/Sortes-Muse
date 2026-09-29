"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { SPREADS } from "@/lib/tarot";
import { MAJORS } from "@/lib/cards";
import { TAGLINE } from "@/lib/site";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.6, ease: "easeOut" as const },
};

export default function Home() {
  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0" aria-hidden="true">
          <Image
            src="/brand/hero-bg.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-ink/40 via-ink/55 to-ink" />
        </div>
        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 pb-24 pt-24 text-center sm:px-6 sm:pt-32">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="text-xs uppercase tracking-[0.35em] text-gold"
          >
            A Resonant Atlas tarot experience
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15 }}
            className="mt-6 font-display text-6xl leading-tight text-cream sm:text-7xl md:text-8xl"
          >
            Sortes
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="mt-4 font-display text-2xl italic text-goldbright sm:text-3xl"
          >
            {TAGLINE}
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.45 }}
            className="mt-6 max-w-xl text-base leading-relaxed text-cream/80"
          >
            An ancient practice of casting lots, reimagined for the modern
            seeker. Draw your free daily card, explore all 78 card meanings,
            and receive readings personalized to your own story.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.6 }}
            className="mt-10 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center"
          >
            <Link
              href="/daily"
              className="btn-gold rounded-2xl px-8 py-4 text-center text-lg font-bold"
            >
              ✦ Draw a Card
            </Link>
            <Link
              href="/spreads"
              className="btn-ghost rounded-2xl px-8 py-4 text-center text-lg font-semibold"
            >
              Begin a Reading
            </Link>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="mt-5 text-sm text-mist"
          >
            Your first full reading is free. No card, no account, no friction.
          </motion.p>
        </div>
      </section>

      {/* WHAT IS TAROT */}
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <motion.div {...fadeUp}>
          <div className="rule-gold mx-auto w-24" />
          <h2 className="mt-6 text-center font-display text-4xl text-goldbright sm:text-5xl">
            What is tarot?
          </h2>
          <div className="mt-8 space-y-5 text-base leading-relaxed text-cream/85">
            <p>
              Tarot is a deck of 78 cards, 22 Major Arcana and 56 Minor Arcana,
              used for centuries as a mirror for the mind. Each card holds
              layered symbolism: archetypes, elements, numbers, and stories
              that reflect the patterns of human life.
            </p>
            <p>
              A reading is not a verdict about your future. It is a structured
              moment of reflection: you bring a question, the cards offer
              images and language, and meaning emerges in the space between.
              We treat the cards as a mirror, not an oracle.
            </p>
            <p>
              <span className="text-goldbright">Sortes</span> takes its name
              from <em>sortes</em>, the Latin word for lots, the ancient
              practice of casting tokens to seek guidance. Here the lots are
              cards, the casting is a shuffle, and the story is yours.
            </p>
          </div>
        </motion.div>

        <motion.div {...fadeUp} className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            {
              title: "Draw",
              text: "Shuffle the deck and lay the cards face down. Tap each one to reveal it in its own moment.",
            },
            {
              title: "Reflect",
              text: "Read the card meanings in your own words first, then let the personalized interpretation deepen them.",
            },
            {
              title: "Return",
              text: "Every reading is saved to your journal. Patterns across weeks reveal what single days cannot.",
            },
          ].map((s) => (
            <div
              key={s.title}
              className="rounded-2xl border border-gold/20 bg-panel/60 p-6"
            >
              <p className="font-display text-2xl text-gold">{s.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-cream/80">{s.text}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* SPREADS PREVIEW */}
      <section className="border-y border-gold/10 bg-navydeep/40 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div {...fadeUp} className="text-center">
            <h2 className="font-display text-4xl text-goldbright sm:text-5xl">
              Choose your spread
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-cream/75">
              From a single mirror to the full ten-card landscape. Your first
              reading is on us.
            </p>
          </motion.div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {SPREADS.map((s, i) => (
              <motion.div
                key={s.slug}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: i * 0.1 }}
                className="relative overflow-hidden rounded-3xl border border-gold/25 bg-panel/70 p-7"
              >
                {s.slug === "quick-insight" && (
                  <span className="absolute right-4 top-4 rounded-full bg-gold px-3 py-1 text-xs font-bold text-ink">
                    FIRST FREE
                  </span>
                )}
                <p className="text-xs uppercase tracking-[0.25em] text-mist">
                  {s.cards} {s.cards === 1 ? "card" : "cards"}
                </p>
                <h3 className="mt-2 font-display text-3xl text-cream">{s.name}</h3>
                <p className="mt-3 min-h-[3.5rem] text-sm leading-relaxed text-cream/75">
                  {s.description}
                </p>
                <p className="mt-4 font-display text-2xl text-goldbright">
                  ${s.price.toFixed(2)}
                </p>
                <Link
                  href={`/spreads/${s.slug}`}
                  className={`mt-5 block rounded-xl px-4 py-3 text-center font-semibold ${
                    s.slug === "quick-insight" ? "btn-gold" : "btn-ghost"
                  }`}
                >
                  {s.slug === "quick-insight" ? "Start free reading" : "View spread"}
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* DAILY CARD TEASER */}
      <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
        <motion.div {...fadeUp}>
          <p className="text-xs uppercase tracking-[0.35em] text-gold">
            A daily ritual
          </p>
          <h2 className="mt-4 font-display text-4xl text-goldbright sm:text-5xl">
            One card, every morning
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-cream/75">
            Free forever, zero questions asked. Draw today&apos;s card in
            seconds and carry its reflection with you.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            {MAJORS.slice(0, 5).map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 20, rotate: (i - 2) * 6 }}
                whileInView={{ opacity: 1, y: 0, rotate: (i - 2) * 6 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
                className="relative h-28 w-[4.5rem] overflow-hidden rounded-lg border border-gold/30 sm:h-36 sm:w-24"
              >
                <Image
                  src={c.image}
                  alt={c.name}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              </motion.div>
            ))}
          </div>
          <Link
            href="/daily"
            className="btn-gold mt-8 inline-block rounded-2xl px-8 py-3.5 font-bold"
          >
            Draw today&apos;s card
          </Link>
        </motion.div>
      </section>
    </div>
  );
}
