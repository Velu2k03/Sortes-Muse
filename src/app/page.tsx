"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useCanHide } from "@/lib/use-mounted";
import { MAJORS, cardSlug, getCard } from "@/lib/cards";
import { setHeroQuestion, freeReadingUsed } from "@/lib/storage";
import { useAuth, deviceHeldSession } from "@/components/AuthProvider";
import { isFreeAvailableFor } from "@/lib/free-reading";
import { HERO_VARIANTS, randomHeroVariantIndex } from "@/lib/hero-variants";
import ReturningHome from "@/components/ReturningHome";
import StatsStrip from "@/components/StatsStrip";
import SampleReading from "@/components/SampleReading";
import TodaySample from "@/components/TodaySample";
import ReturnLoop from "@/components/ReturnLoop";
import AccountDeletedNotice from "@/components/AccountDeletedNotice";
import { Orb } from "@/components/ReactBitsNew";
import HeroScene from "@/components/HeroScene";

// AF-042: the audit's "12 simultaneous animations" is stale — Phase
// 4C had already removed the gimmicks. Counted at fix time, the
// continuous heavy animations were 3 (Orb loop, global starfield
// canvas, nebula drift) plus one-shot reveals. The nebula is deleted
// and the six hero motion wrappers were no-ops (initial false,
// animate to final values), so they are plain elements now.
// Continuous heavy on the homepage is now 2: Orb + starfield.
// The remaining motion is one-shot: 3 fadeUp section reveals (once)
// and SampleReading's 2 whileInView reveals, all governed by
// MotionProvider reducedMotion="user". Phase 4C (4.6): the competing
// gimmicks are gone from this page: GradientText and ShinyText sweeps,
// StarBorder crawling dots, Magnet pull, SpotlightCard and MagicBento
// cursor glow, the TarotFan scroll fan, and the OrbitImages carousel.
// Orb stays: it is the slow ambient hero background, not a competing
// gimmick, and it is static under prefers-reduced-motion.
// AF-033: the hidden initial state is applied only after mount and never
// under reduced motion, so server HTML (and no-JS) renders visible.
const fadeUpFor = (hide: boolean) => ({
  initial: hide ? { opacity: 0, y: 24 } : (false as const),
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.25, ease: "easeOut" as const },
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

// Remodel (Velu, 2026-11-14, Fable's review): tappable example
// questions under the hero input. Tapping one fills the input — it
// does not submit, so the seeker can edit it first, and the button
// works with no question typed.
const EXAMPLE_QUESTIONS = [
  "What should I focus on today?",
  "Is this the right move?",
  "What is blocking me?",
  "What does the week ahead hold?",
];

export default function Home() {
  const hide = useCanHide();
  const fadeUp = fadeUpFor(hide);
  const revealKey = hide ? "reveal" : "static";
  const fanCards = MAJORS.slice(0, 5);
  const middle = (fanCards.length - 1) / 2;
  // Remodel: the hero question box. Submitting starts the reading
  // on the intake page; a typed question travels in localStorage
  // (see setHeroQuestion) and prefills there, and an empty submit
  // goes to the same intake with no question.
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const questionRef = useRef<HTMLInputElement>(null);
  // Remodel: the "free" wording is gated on the same free-availability
  // rule the generate route spends from (Batch 6a pattern, copied from
  // ReturnLoop on this page): signed-in users by the server record,
  // guests by the device flag, and it fails closed while auth is
  // loading, so the hero never promises a free reading to someone who
  // must sign in first. The intake route is prefetched on mount, so
  // the hero submit lands at once.
  const { user, freeReadingAvailable, authFailed, loading: authLoading } = useAuth();
  const [usedFree, setUsedFree] = useState(false);
  const [hadSession, setHadSession] = useState(false);
  // Hero copy rotation (Velu, 2026-11-15): the H1, subhead, and CTA
  // labels rotate randomly among four variants on each page load.
  // The page is server-rendered, so the hero renders variant A
  // (index 0) on the server and on first paint, then picks a random
  // variant after mount. A random pick during render would disagree
  // between server and client (hydration mismatch). The setState
  // runs in a microtask, the same pattern as the device flags below
  // (react-hooks/set-state-in-effect is an error in this repo).
  // Restored 2026-11-16 by Velu's push-gate decision ("Restore the
  // rotation"): the audit had replaced it with one fixed headline
  // (F03), and he overruled that. The single-CTA layout from the
  // audit (F05) stays: only the primary CTA label rotates, the
  // secondary CTA link is not restored.
  const [variantIndex, setVariantIndex] = useState(0);
  const variant = HERO_VARIANTS[variantIndex];
  useEffect(() => {
    queueMicrotask(() => {
      setVariantIndex(randomHeroVariantIndex());
    });
  }, []);
  // Velu's Option B (2026-11-14, "Show the hero to all signed-out
  // guests"): the hero shows to EVERY signed-out guest, regardless
  // of device flags. The Batch 3 four-signal rule (signed in, used
  // the free reading, has journal history, or drew today's card) is
  // superseded — a signed-out guest who used the free reading used
  // to land on the returning home (balance 0 + a 1-Oracle button
  // into the sign-in gate) and never see the hero again. Only the
  // two flags the free-availability gate needs are read here now:
  // usedFree and hadSession feed isFreeAvailableFor below, so a
  // used-free guest sees the hero WITHOUT the free promise. History
  // and the daily card are still read by ReturningHome itself
  // (signed-in only).
  useEffect(() => {
    queueMicrotask(() => {
      setUsedFree(freeReadingUsed());
      setHadSession(deviceHeldSession());
    });
    router.prefetch("/intake/quick-insight");
  }, [router]);
  const freeAvailable =
    !authLoading &&
    isFreeAvailableFor({
      slug: "quick-insight",
      signedIn: !!user,
      serverFree: freeReadingAvailable,
      deviceFree: !usedFree,
      hadSession,
      authFailed,
    });
  const fillExample = (q: string) => {
    setQuestion(q);
    questionRef.current?.focus();
  };
  const onHeroSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Overwritten on every submit, even an empty one: a stale pending
    // question must not survive an empty submission and prefill later.
    // The reader treats a blank value as no question.
    setHeroQuestion(question.trim());
    router.push("/intake/quick-insight");
  };
  // Velu's Option B (2026-11-14): ReturningHome only when signed
  // in. While auth is loading `user` is null, so the hero shows —
  // no ReturningHome flash for a guest. Once the auth refresh
  // lands for a signed-in visitor, this flips to ReturningHome
  // (the same brief-landing-then-swap returning users already had).
  const isReturning = !!user;
  if (isReturning) {
    return (
      <div>
        <AccountDeletedNotice />
        <ReturningHome />
      </div>
    );
  }
  return (
    <div>
      <AccountDeletedNotice />
      {/* HERO */}
      <section className="hero-texture relative overflow-hidden">
        <div className="absolute inset-0" aria-hidden="true">
          <Image
            src="/brand/hero-bg.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="hero-img object-cover opacity-70"
          />
          <div className="hero-scrim absolute inset-0" />
          {/* Deep UX Batch A2, doc item 11: Orb hero background, app gold only. */}
          <Orb />
          {/* Batch 10 slop fix: the violet nebula was the classic AI
              purple glow tic from the kill-ai-slop taxonomy. Gold only
              now, the site already has a gold identity. The gold nebula
              itself is deleted too (AF-042): it was a third continuous
              homepage animation on top of Orb and the starfield. */}
        </div>
        <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-20">
          {/* Hero text renders at full opacity on first paint: the old
              0.8s fade with up to 0.9s delay left the first frame almost
              empty behind the moon image. Gentle motion stays below the
              fold, in fadeUp, and in the card fan. */}
          {/* AF-042: the hero motion wrappers were no-ops (initial
              false, animate to the final values), so they are plain
              elements now — one less animation instance each. */}
          {/* Hero copy rotation (Velu, 2026-11-15, restored by his
              2026-11-16 push-gate decision): the H1, subhead, and
              primary CTA label rotate randomly among four variants
              (src/lib/hero-variants.ts) on each page load. Variant A
              is his headline, so it renders on the server and on
              first paint. The audit's one fixed headline (F03) was
              overruled; the single-CTA layout (F05, one primary
              action per screen) stays, so the secondary CTA link is
              not restored, and the "No experience needed" line stays
              gone (F06). The free reading stays 1-card Quick Insight
              only. The "free" wording is gated on freeAvailable
              (Batch 6a rule): it never promises a free reading to
              someone who must sign in first, and it fails closed
              while auth is loading. No entrance animation on the hero
              copy: it renders at full opacity on first paint (the old
              fade left the first frame almost empty behind the moon
              image), and the example questions stay visible as
              tappable chips instead of rotating one at a time. */}
          <h1 className="mt-6 max-w-4xl text-balance font-display text-4xl leading-tight text-goldbright sm:text-5xl">
            {variant.h1}
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-cream/80">
            {variant.h2}
          </p>
          <form
            action="/intake/quick-insight"
            onSubmit={onHeroSubmit}
            className="mt-6 flex w-full max-w-xl flex-col gap-3 sm:flex-row"
          >
            <label htmlFor="hero-question" className="sr-only">
              What&apos;s on your mind?
            </label>
            <input
              id="hero-question"
              ref={questionRef}
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What's on your mind?"
              autoComplete="off"
              maxLength={300}
              enterKeyHint="go"
              className="w-full flex-1 rounded-2xl border border-gold/30 bg-ink/70 px-5 py-4 text-base text-cream placeholder:text-cream/60 focus:border-gold"
            />
            <button
              type="submit"
              className="btn-gold rounded-2xl px-6 py-4 text-center text-base font-bold leading-snug sm:shrink-0 sm:px-8 sm:text-lg"
            >
              {variant.primaryCta}
            </button>
          </form>
          {/* Sonnet review: the chips are a labelled group with 44px
              touch targets. A fieldset + legend, not role="group":
              the repo lints role="group" as an error against the
              jsx-a11y baseline. */}
          <fieldset className="mt-4 flex flex-wrap justify-center gap-2 border-0 p-0 m-0">
            <legend className="sr-only">Example questions</legend>
            {EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => fillExample(q)}
                className="min-h-11 rounded-full border border-gold/30 px-4 py-2 text-sm text-cream/80 transition-colors hover:border-gold/60 hover:text-cream"
              >
                {q}
              </button>
            ))}
          </fieldset>
          {freeAvailable && (
            <p className="mt-5 text-sm text-mist">
              Your first reading is free, no sign-up, no payment.
            </p>
          )}
          <p className="mt-2 text-xs text-mist/80">
            Written just for you, saved in your journal.
          </p>
          {/* Phase 2 3D hero (Velu's choice 5): the fan of 3D tarot
              cards with the gold moon behind, below the question
              box. The question box stays first and usable before the
              3D loads; the scene is the centrepiece, not a splash. */}
          <div className="mt-6 w-full">
            <HeroScene />
          </div>
          {/* AF-034: the pricing line and the charts line stay off
              the hero. Pricing lives on /oracles; charts have their
              own nav entry. */}
        </div>
      </section>

      {/* Remodel Phase 1 batch 2: today's card as the sample
          reading, directly below the hero. One card, one line. */}
      <TodaySample />

      <StatsStrip />

      {/* WHAT'S ON YOUR MIND */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h2 className="font-display text-4xl text-goldbright sm:text-5xl">
          What&apos;s on your mind?
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: "/spreads/love-insight", label: "Love", text: "You, them, and the connection.", cost: "1 Oracle" },
            { href: "/spreads/career-path", label: "Career", text: "Current, obstacle, and next step.", cost: "1 Oracle" },
            { href: "/spreads/weekly-outlook", label: "The week ahead", text: "Focus, challenge, and opportunity.", cost: "1 Oracle" },
            { href: "/spreads/quick-insight", label: "A general question", text: "One card for one question. Then 1 Oracle.", cost: "First free" },
          ].map((s) => (
            <div
              key={s.href}
              className="rounded-2xl border border-gold/25 bg-panel/70 transition-transform duration-300 hover:-translate-y-1 hover:border-gold/60"
            >
              <Link href={s.href} className="block p-6">
                <p className="font-display text-2xl text-goldbright">{s.label}</p>
                <p className="mt-2 text-sm leading-relaxed text-cream/75">{s.text}</p>
                <p className="mt-3 text-sm font-semibold text-gold">{s.cost}</p>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* AF-034: the duplicate "All spreads" grid lived here (the
          full list is /spreads). Deleted; the "What's on your mind?"
          cards above stay as the spread entry. */}

      {/* EXPLORE THE DECK */}
      <section className="border-y border-gold/10 bg-navydeep/40 py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div>
            <h2 className="font-display text-4xl text-goldbright sm:text-5xl">
              Explore the deck
            </h2>
            <p className="mt-6 max-w-xl text-cream/75">
              Browse all 78 cards.
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
                  <span className="relative block aspect-[3/5] w-full overflow-hidden rounded-xl border border-gold/25 shadow-card">
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
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <motion.div key={`${revealKey}-intro`} {...fadeUp}>
          <div className="rule-gold w-24" />
          <h2 className="mt-6 font-display text-4xl text-goldbright sm:text-5xl">
            What is tarot?
          </h2>
          <p className="mt-6 text-base leading-relaxed text-cream/85">
            78 cards. Tarot helps you think.
          </p>
        </motion.div>

        {/* Remodel Phase 1 batch 2: the 3 steps are How it works
            (Ask, Draw, Read), following the funnel. The "What is
            tarot?" one-liner above stays where it is. React Bits
            MagicBento was the plan's pick for these cards, but its
            vendored file fails the repo lint (react-hooks/refs
            errors, no-img-element warning) and Phase 4C already
            removed its cursor glow from this page as a gimmick, so
            the existing motion step cards stay. */}
        <motion.div key={`${revealKey}-steps`} {...fadeUp} className="mt-12">
          <h3 className="font-display text-3xl text-goldbright">
            How it works
          </h3>
          <ol className="mt-8 grid divide-y divide-gold/25 sm:grid-cols-3 sm:gap-8 sm:divide-y-0 sm:border-t sm:border-gold/25">
            {[
              {
                title: "Ask",
                text: "Type the question on your mind.",
              },
              {
                title: "Draw",
                text: "Draw a card from the deck.",
              },
              {
                title: "Read",
                text: "Get a reading written for your question.",
              },
            ].map((s, i) => (
              <li
                key={s.title}
                className="flex gap-5 py-5 sm:flex-col sm:gap-3 sm:pb-0 sm:pt-6"
              >
                <span
                  aria-hidden="true"
                  className="font-display text-5xl leading-none text-gold"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="font-display text-2xl text-cream">{s.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-cream/80">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </motion.div>
      </section>

      {/* SAMPLE READING TEASER — AF-034: collapsed on the homepage
          diet; the full sample is one tap away. The component carries
          its own navy band, so no wrapper band here. */}
      <SampleReading collapsed />

      {/* Deep UX Batch B: return loop, daily quote, today's card,
          and journal preview, on home itself, before the seek cards. */}
      <ReturnLoop />

      {/* DAILY CARD TEASER */}
      <section className="border-y border-gold/10 bg-navydeep/40 py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div key={revealKey} {...fadeUp}>
          <h2 className="mt-4 font-display text-4xl text-goldbright sm:text-5xl">
            One card, every morning
          </h2>
          <p className="mt-6 max-w-lg text-cream/75">
            Draw today&apos;s card in seconds.
          </p>
          {/* Phase 4C (4.6a): the scroll fan is a static fan. Same
              five cards, same tilt and curve, same hover lift on the
              hovered card, no entrance animation. Phone width:
              72 + 4 x 48 = 264px, inside a 360px phone's 328px
              content width, so no horizontal scroll. */}
          <ul role="list" className="mt-8 flex justify-start" aria-label="Tarot cards">
            {fanCards.map((c, i) => {
              const offset = i - middle;
              const tilt = offset * 7;
              const drop = Math.abs(offset) * 6;
              return (
                <li
                  key={c.id}
                  style={{ zIndex: 10 - Math.abs(offset), transform: `translateY(${drop}px) rotate(${tilt}deg)` }}
                  className="-ml-6 first:ml-0 sm:-ml-8 sm:first:ml-0"
                >
                  <Link
                    href="/deck"
                    aria-label={`See ${c.name} in the deck`}
                    className="block rounded-xl transition-transform duration-300 hover:-translate-y-3 hover:scale-105 hover:rotate-0 focus-visible:-translate-y-3 focus-visible:scale-105 focus-visible:rotate-0"
                  >
                    <div className="relative h-28 w-[4.5rem] overflow-hidden rounded-xl border border-gold/25 shadow-card sm:h-36 sm:w-24">
                      <Image
                        src={c.image}
                        alt={c.name}
                        fill
                        sizes="96px"
                        className="object-cover"
                      />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          {/* unslopovich (2026-11-16, Velu approved): the duplicate
              "Draw today's card" CTA is removed here. The same CTA
              already sits in TodaySample near the top of the page,
              and the fan cards above link to /deck. */}
        </motion.div>
        </div>
      </section>

      {/* Phase 2 pricing preview: the three plans as identical cards,
          same size and padding, Star marked popular by a gold border
          and badge, never by height (#59, #75). Full pricing lives
          on /pricing. */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6" aria-label="Pricing preview">
        <h2 className="mt-4 font-display text-4xl text-goldbright sm:text-5xl">
          Simple plans, clear prices
        </h2>
        <p className="mt-6 max-w-lg text-cream/75">
          Start free with one card a day.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            { name: "Spark", price: "$9.99", oracles: "1,000 Oracles a month", popular: false },
            { name: "Star", price: "$19.99", oracles: "2,500 Oracles a month", popular: true },
            { name: "Moon", price: "$39.99", oracles: "6,000 Oracles a month", popular: false },
          ].map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-2xl border p-6 text-center ${
                tier.popular
                  ? "border-gold bg-gold/10 shadow-gold"
                  : "border-gold/25 bg-panel/60"
              }`}
            >
              {tier.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gold px-3 py-1 text-xs font-bold uppercase tracking-wide text-ink">
                  Most popular
                </span>
              )}
              <h3 className="font-display text-2xl text-goldbright">{tier.name}</h3>
              <p className="mt-2 text-3xl font-bold text-cream">
                {tier.price}
                <span className="text-base font-normal text-mist"> / month</span>
              </p>
              <p className="mt-2 text-sm text-cream/75">{tier.oracles}</p>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <Link
            href="/pricing"
            className="btn-gold inline-block rounded-2xl px-8 py-3.5 font-semibold"
          >
            See full pricing
          </Link>
        </div>
      </section>
    </div>
  );
}
