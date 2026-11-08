"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { useCanHide } from "@/lib/use-mounted";
import { MAJORS, cardSlug, getCard } from "@/lib/cards";
import { TAGLINE } from "@/lib/site";
import StatsStrip from "@/components/StatsStrip";
import SampleReading from "@/components/SampleReading";
import ReturnLoop from "@/components/ReturnLoop";
import Icon from "@/components/Icon";
import { Orb } from "@/components/ReactBitsNew";

// Phase 4C (4.6): restrained motion. The homepage animation set is
// now starfield (global, in the layout) + card lift + section reveal
// only. The competing gimmicks are gone from this page: GradientText
// and ShinyText sweeps, StarBorder crawling dots, Magnet pull,
// SpotlightCard and MagicBento cursor glow, the TarotFan scroll fan,
// and the OrbitImages carousel. Orb stays: it is the slow ambient
// hero background, not a competing gimmick, and it is static under
// prefers-reduced-motion. MotionConfig reducedMotion="user" in the
// MotionProvider still governs the framer-motion reveals below.
// AF-033: the hidden initial state is applied only after mount and never
// under reduced motion, so server HTML (and no-JS) renders visible.
const fadeUpFor = (hide: boolean) => ({
  initial: hide ? { opacity: 0, y: 24 } : (false as const),
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.6, ease: "easeOut" as const },
});

// Phase 4C (4.6): the orbit carousel is replaced by a static grid of
// the same six Major Arcana cards, each linking to its own card page.
const EXPLORE_CARD_IDS = [
  "major-00",
  "major-01",
  "major-02",
  "major-18",
  "major-19",
  "major-17",
];

export default function Home() {
  const hide = useCanHide();
  const fadeUp = fadeUpFor(hide);
  const revealKey = hide ? "reveal" : "static";
  const fanCards = MAJORS.slice(0, 5);
  const middle = (fanCards.length - 1) / 2;
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
          {/* Deep UX Batch A2, doc item 11: Orb hero background, app gold only. */}
          <Orb />
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
            className="mt-6 font-display text-6xl leading-tight text-goldbright sm:text-7xl md:text-8xl"
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
          {/* AF-034 homepage diet: the Latin etymology line is gone
              (it belongs on /about, which needs Velu's identity copy
              first — AF-036 — so it is dropped, not moved). */}
          {/* AF-034: one primary CTA, the free reading. "Draw a Card"
              is the quiet secondary; "See all spreads" is gone (the
              seek cards below and /spreads cover it). */}
          <motion.div
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            className="mt-10 flex w-full max-w-xl flex-col gap-3 sm:flex-row sm:flex-nowrap sm:justify-center"
          >
            <Link
              href="/spreads/quick-insight"
              className="btn-gold shrink-0 whitespace-nowrap rounded-2xl px-8 py-4 text-center text-lg font-bold"
            >
              Ask your question · First reading free
            </Link>
            <Link
              href="/daily"
              className="btn-ghost shrink-0 whitespace-nowrap rounded-2xl px-8 py-4 text-center text-lg font-semibold"
            >
              <Icon name="sparkle" size={20} className="mr-2 inline-block align-[-3px]" />Draw a Card
            </Link>
          </motion.div>
          {/* Phase 4C (4.6b): the free-reading promise is stated once,
              here. The repeats are gone: the Quick Insight seek card
              below now shows its price (1 Oracle), the spreads
              preview no longer repeats the sentence, and the daily
              teaser no longer says "Free, every day" (the hero line
              above already says the daily card is free). */}
          <motion.p
            initial={false}
            animate={{ opacity: 1 }}
            className="mt-5 text-sm text-mist"
          >
            Your first Quick Insight reading is free. No card, no account.
          </motion.p>
          {/* AF-034: the pricing line and the charts line are gone
              from the hero. Pricing lives on /oracles; charts have
              their own nav entry. The hero is one promise + one CTA. */}
        </div>
      </section>

      <StatsStrip />

      {/* WHAT DO YOU SEEK */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h2 className="text-center font-display text-3xl text-goldbright sm:text-4xl">
          What do you seek?
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: "/spreads/love-insight", label: "Love", text: "You, them, and the connection.", cost: "1 Oracle" },
            { href: "/spreads/career-path", label: "Career", text: "Current, obstacle, and next step.", cost: "1 Oracle" },
            { href: "/spreads/weekly-outlook", label: "The week ahead", text: "Focus, challenge, and opportunity.", cost: "1 Oracle" },
            { href: "/spreads/quick-insight", label: "A general question", text: "One card, one clear mirror.", cost: "First free · then 1 Oracle" },
          ].map((s) => (
            <div
              key={s.href}
              className="rounded-3xl border border-gold/25 bg-panel/70 transition-transform duration-300 hover:-translate-y-1 hover:border-gold/60"
            >
              <Link href={s.href} className="block p-6">
                <p className="font-display text-2xl text-goldbright">{s.label}</p>
                <p className="mt-2 text-sm leading-relaxed text-cream/75">{s.text}</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-gold">{s.cost}</p>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* AF-034: the duplicate "All spreads" grid lived here (the
          full list is /spreads). Deleted; the "What do you seek?"
          cards above stay as the spread entry. */}

      {/* EXPLORE THE DECK */}
      <section className="border-y border-gold/10 bg-navydeep/40 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <h2 className="font-display text-4xl text-goldbright sm:text-5xl">
              Explore the deck
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-cream/75">
              Meet a few of the cards and explore the stories held in the deck.
            </p>
          </div>
          {/* Phase 4C (4.6a): the orbit carousel is a static grid of
              the same six cards, each with a hover lift. */}
          <div className="mt-8 grid grid-cols-3 gap-4 sm:grid-cols-6">
            {EXPLORE_CARD_IDS.map((id) => {
              const card = getCard(id);
              return (
                <Link
                  key={card.id}
                  href={`/deck/${cardSlug(card.name)}`}
                  aria-label={`Explore ${card.name} in the deck`}
                  className="block transition-transform duration-300 hover:-translate-y-1 focus-visible:-translate-y-1"
                >
                  <span className="relative block aspect-[3/5] w-full overflow-hidden rounded-lg border border-gold/30 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
                    <Image
                      src={card.image}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 30vw, 160px"
                      className="object-cover"
                    />
                  </span>
                  <span className="mt-2 block text-center text-xs font-semibold text-cream/80">
                    {card.name}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* WHAT IS TAROT */}
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <motion.div key={revealKey} {...fadeUp}>
          <div className="rule-gold mx-auto w-24" />
          <h2 className="mt-6 text-center font-display text-4xl text-goldbright sm:text-5xl">
            What is tarot?
          </h2>
          <p className="mt-8 text-center text-base leading-relaxed text-cream/85">
            78 cards. A mirror for the mind, not a verdict on your future.
          </p>
        </motion.div>

        <motion.div key={revealKey} {...fadeUp} className="mt-12 grid gap-4 sm:grid-cols-3">
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

      {/* SAMPLE READING TEASER — AF-034: collapsed on the homepage
          diet; the full sample is one tap away. */}
      <SampleReading collapsed />

      {/* Deep UX Batch B: return loop, daily quote, today's card,
          and journal preview, on home itself, before the seek cards. */}
      <ReturnLoop />

      {/* DAILY CARD TEASER */}
      <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
        <motion.div key={revealKey} {...fadeUp}>
          <p className="text-xs uppercase tracking-[0.35em] text-gold">
            A daily ritual
          </p>
          <h2 className="mt-4 font-display text-4xl text-goldbright sm:text-5xl">
            One card, every morning
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-cream/75">
            Draw today&apos;s card in seconds.
          </p>
          {/* Phase 4C (4.6a): the scroll fan is a static fan. Same
              five cards, same tilt and curve, same hover lift on the
              hovered card, no entrance animation. Phone width:
              72 + 4 x 48 = 264px, inside a 360px phone's 328px
              content width, so no horizontal scroll. */}
          <div className="mt-8 flex justify-center" role="list" aria-label="Tarot cards">
            {fanCards.map((c, i) => {
              const offset = i - middle;
              const tilt = offset * 7;
              const drop = Math.abs(offset) * 6;
              return (
                <div
                  key={c.id}
                  role="listitem"
                  style={{ zIndex: 10 - Math.abs(offset), transform: `translateY(${drop}px) rotate(${tilt}deg)` }}
                  className="-ml-6 first:ml-0 sm:-ml-8 sm:first:ml-0"
                >
                  <Link
                    href="/deck"
                    aria-label={`See ${c.name} in the deck`}
                    className="block rounded-lg transition-transform duration-300 hover:-translate-y-3 hover:scale-105 hover:rotate-0 focus-visible:-translate-y-3 focus-visible:scale-105 focus-visible:rotate-0"
                  >
                    <div className="relative h-28 w-[4.5rem] overflow-hidden rounded-lg border border-gold/30 shadow-[0_8px_24px_rgba(0,0,0,0.45)] sm:h-36 sm:w-24">
                      <Image
                        src={c.image}
                        alt={c.name}
                        fill
                        sizes="96px"
                        className="object-cover"
                      />
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
          <Link
            href="/daily"
            className="btn-ghost mt-8 inline-block rounded-2xl px-8 py-3.5 font-semibold"
          >
            Draw today&apos;s card
          </Link>
        </motion.div>
      </section>
    </div>
  );
}
