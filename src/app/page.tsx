"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { SPREADS } from "@/lib/tarot";
import { MAJORS } from "@/lib/cards";
import { TAGLINE } from "@/lib/site";
import StatsStrip from "@/components/StatsStrip";
import SampleReading from "@/components/SampleReading";
import Icon from "@/components/Icon";

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
          <div className="absolute inset-0 bg-gradient-to-b from-ink/60 via-ink/75 to-ink" />
          {/* Ambient drifting glows */}
          <div
            className="nebula absolute -left-32 top-1/4 h-[28rem] w-[28rem] rounded-full opacity-25 blur-3xl"
            style={{
              background:
                "radial-gradient(circle, rgba(212,175,55,0.5) 0%, transparent 70%)",
            }}
          />
          {/* Batch 10 slop fix: the violet nebula was the classic AI
              purple glow tic from the kill-ai-slop taxonomy. Gold only
              now, the site already has a gold identity. */}
        </div>
        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 pb-24 pt-24 text-center sm:px-6 sm:pt-32">
          {/* Hero text renders at full opacity on first paint: the old
              0.8s fade with up to 0.9s delay left the first frame almost
              empty behind the moon image. Gentle motion stays below the
              fold, in fadeUp, and in the card fan. */}
          <motion.p
            initial={false}
            animate={{ opacity: 1 }}
            className="text-xs uppercase tracking-[0.35em] text-gold"
          >
            A Resonant Atlas tarot experience
          </motion.p>
          <motion.h1
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 font-display text-6xl leading-tight text-cream sm:text-7xl md:text-8xl"
          >
            Sortes
          </motion.h1>
          <motion.p
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 font-display text-2xl italic text-goldbright sm:text-3xl"
          >
            {TAGLINE}
          </motion.p>
          <motion.p
            initial={false}
            animate={{ opacity: 1 }}
            className="mt-6 max-w-xl text-base leading-relaxed text-cream/80"
          >
            Draw a free daily card, explore 78 card meanings, and get a
            reading for your question.
          </motion.p>
          {/* Audit 4: hero CTAs wrapped on the very first load, then
              were single-line on warm reloads, so whitespace-nowrap
              alone did not prove stability. Definitive enforcement:
              flex-nowrap at sm+, shrink-0 on both links so neither
              link can shrink and then wrap, and the container stays
              max-w-xl (576px), which fits both buttons even at a
              wider fallback-font width (about 460px at loaded font,
              under 576px with a 20% fallback widening). On mobile
              the column stack is intentional and unchanged. */}
          <motion.div
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            className="mt-10 flex w-full max-w-xl flex-col gap-3 sm:flex-row sm:flex-nowrap sm:justify-center"
          >
            <Link
              href="/daily"
              className="btn-gold shrink-0 whitespace-nowrap rounded-2xl px-8 py-4 text-center text-lg font-bold"
            >
              <Icon name="sparkle" size={20} className="mr-2 inline-block align-[-3px]" />Draw a Card
            </Link>
            <Link
              href="/spreads"
              className="btn-ghost shrink-0 whitespace-nowrap rounded-2xl px-8 py-4 text-center text-lg font-semibold"
            >
              Begin a Reading <Icon name="arrowRight" size={20} className="ml-2 inline-block align-[-3px]" />
            </Link>
          </motion.div>
          <motion.p
            initial={false}
            animate={{ opacity: 1 }}
            className="mt-5 text-sm text-mist"
          >
            Your first Quick Insight reading is free. No card, no account, no friction.
          </motion.p>
          <motion.p
            initial={false}
            animate={{ opacity: 1 }}
            className="mt-3 text-sm text-cream/75"
          >
            New: birth charts, Ziwei, Western, and Vedic, calculation only and free.{" "}
            <Link href="/charts" className="font-semibold text-goldbright underline underline-offset-4">
              Cast a birth chart
            </Link>
          </motion.p>
        </div>
      </section>

      <StatsStrip />

      {/* WHAT IS TAROT */}
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <motion.div {...fadeUp}>
          <div className="rule-gold mx-auto w-24" />
          <h2 className="mt-6 text-center font-display text-4xl text-goldbright sm:text-5xl">
            What is tarot?
          </h2>
          <div className="mt-8 space-y-5 text-base leading-relaxed text-cream/85">
            <p>
              Tarot is 78 cards, 22 Major and 56 Minor Arcana, used for
              centuries as a mirror for the mind.
            </p>
            <p>
              A reading is not a verdict on your future. You bring a
              question, the cards offer images, and meaning emerges between
              them. A mirror, not an oracle.
            </p>
            <p>
              <span className="text-goldbright">Sortes</span> is Latin for
              lots. Here the lots are cards, the casting is a shuffle, and
              the story is yours.
            </p>
          </div>
        </motion.div>

        <motion.div {...fadeUp} className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            {
              title: "Draw",
              text: "Shuffle, lay the cards face down, tap each one to reveal it.",
            },
            {
              title: "Reflect",
              text: "Read the meanings first, then the interpretation for your question.",
            },
            {
              title: "Return",
              text: "Every reading is saved to your journal. Patterns across weeks show more than single days.",
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
              From one card to the full ten-card spread. Your first Quick
              Insight is free.
            </p>
          </motion.div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {SPREADS.map((s, i) => (
              <motion.div
                key={s.slug}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: i * 0.05 }}
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
                  {s.slug === "quick-insight" ? "Free" : "1 credit"}
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

      {/* SAMPLE READING TEASER */}
      <SampleReading />

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
            Free, every day. Draw today&apos;s card in seconds.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            {MAJORS.slice(0, 5).map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 20, rotate: (i - 2) * 6 }}
                whileInView={{ opacity: 1, y: 0, rotate: (i - 2) * 6 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
              >
                {/* Audit 4 phone check: 5 cards at 72px + 4 x 12px gaps
                    = 408px, wider than a 360px phone's 328px content
                    width, so the home page scrolled horizontally.
                    52px cards give 5 x 52 + 4 x 12 = 308px, inside
                    328px, with the sm size unchanged. */}
                <div
                  className="float-slow relative h-24 w-[3.25rem] overflow-hidden rounded-lg border border-gold/30 sm:h-36 sm:w-24"
                  style={{ animationDelay: `${i * 0.7}s` }}
                >
                  <Image
                    src={c.image}
                    alt={c.name}
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                </div>
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
