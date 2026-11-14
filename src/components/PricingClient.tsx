"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Section } from "@astryxdesign/core/Section";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Grid } from "@astryxdesign/core/Grid";
import { StarBorder } from "@/components/ReactBits";
import CountUp from "@/components/CountUp";

// Astryx scoped pilot (pricing page only, Velu 2026-11-14). UI only:
// subscription variants do not exist in Lemon Squeezy yet, so the
// tier buttons are disabled placeholders and nothing here wires to
// checkout. Packs stay on /oracles, untouched by this page.
//
// Feature lists are written ONLY from features that exist in the
// code today (verified 2026-11-14):
// - 1-card / 3-card readings: spreads in src/lib/tarot.ts
//   (quick-insight, past-present-future, love-insight, career-path,
//   weekly-outlook, celtic-cross).
// - Follow-up questions: POST /api/reading/follow-up, capped at 3
//   per reading (src/lib/db/readings.ts), 1 Oracle each today.
// - Chart readings: /charts and /horoscope exist.
// - Reports: transit, year-ahead, relationship (src/app/reports).
// - Daily card: one free card a day (src/app/daily).
// - Journal / reading history: /journal and /api/history exist.
// NOT listed, because they are not built yet: credit rollover
// (single-integer balance, no ledgers), monthly deep reading (no
// monthly product exists), and any tier gating — no code gates a
// feature by tier, so the lists describe what each tier's credits
// cover, with the credit volume as the real differentiator.
// Credit costs (100 / 200 / 300 / 50) are Velu's plan numbers,
// not live prices: the product still spends 1 Oracle per reading.

type Billing = "monthly" | "annual";

type Tier = {
  id: "spark" | "star" | "moon";
  name: string;
  monthly: number;
  annual: number;
  credits: number;
  savings: number;
  popular: boolean;
  features: string[];
};

// Velu's exact numbers, never change them: Spark $7.99 / 1,000
// credits, Star $14.99 / 2,500, Moon $29.99 / 6,000. Annual:
// $79.88 / $149.88 / $299.88. Savings: 7.99 x 12 - 79.88 = $16,
// 14.99 x 12 - 149.88 = $30, 29.99 x 12 - 299.88 = $60.
const TIERS: Tier[] = [
  {
    id: "spark",
    name: "Spark",
    monthly: 7.99,
    annual: 79.88,
    credits: 1000,
    savings: 16,
    popular: false,
    features: [
      "1-card readings — 100 credits each",
      "3-card readings — 200 credits each",
      "Follow-up questions — 50 credits each",
      "Daily card free, every day",
    ],
  },
  {
    id: "star",
    name: "Star",
    monthly: 14.99,
    annual: 149.88,
    credits: 2500,
    savings: 30,
    popular: true,
    features: [
      "Everything in Spark, plus 1,500 more credits a month",
      "Chart readings — 300 credits each",
      "Your journal and reading history",
    ],
  },
  {
    id: "moon",
    name: "Moon",
    monthly: 29.99,
    annual: 299.88,
    credits: 6000,
    savings: 60,
    popular: false,
    features: [
      "Everything in Star, plus 3,500 more credits a month",
      "Reports: transit, year-ahead, and relationship",
      "60 one-card readings a month",
    ],
  },
];

const TOPUPS = [
  { credits: 1000, price: 9.99 },
  { credits: 3000, price: 24.99 },
];

const CREDIT_COSTS = [
  { label: "1-card reading", credits: 100 },
  { label: "3-card reading", credits: 200 },
  { label: "Chart reading", credits: 300 },
  { label: "Follow-up question", credits: 50 },
];

export default function PricingClient() {
  const [billing, setBilling] = useState<Billing>("monthly");

  return (
    // Page-level layout is Astryx Section / Stack / Grid (repo rule:
    // components handle layout, no raw <div> wrappers). The one
    // remaining <div> is the mt-auto spacer inside each Card that
    // pushes the button to the bottom — Astryx has no Spacer
    // component, so it stays. The tier grid reflows by width
    // (minWidth 300, max 3) instead of the old sm:grid-cols-3, so
    // three columns start near 1000px rather than 640px.
    <Section variant="transparent" maxWidth="64rem" padding={8} paddingInline={4} className="mx-auto">
      <VStack gap={0} className="text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-gold">Pricing</p>
        <h1 className="mt-3 font-display text-5xl text-goldbright sm:text-6xl">
          Choose your plan
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-cream/75">
          Monthly credits for readings, charts, and reports. Top-ups
          arrive with subscriptions. Purchased credits never expire.
        </p>
      </VStack>

      <HStack hAlign="center" gap={0} className="mt-8">
        <button
          type="button"
          aria-pressed={billing === "monthly"}
          onClick={() => setBilling("monthly")}
          className={`rounded-l-full border px-5 py-2 text-sm font-semibold ${
            billing === "monthly"
              ? "border-gold bg-gold text-ink"
              : "border-gold/40 bg-panel text-cream"
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          aria-pressed={billing === "annual"}
          onClick={() => setBilling("annual")}
          className={`rounded-r-full border px-5 py-2 text-sm font-semibold ${
            billing === "annual"
              ? "border-gold bg-gold text-ink"
              : "border-gold/40 bg-panel text-cream"
          }`}
        >
          Annual
        </button>
      </HStack>
      <p className="mt-3 text-center text-sm text-cream/75">
        Annual billing: save $16 on Spark, $30 on Star, $60 on Moon.
      </p>

      <Grid columns={{ minWidth: 300, max: 3 }} gap={4} className="mt-6">
        {TIERS.map((tier) => {
          const price = billing === "monthly" ? tier.monthly : tier.annual;
          const card = (
            <Card
              padding={4}
              elevation={tier.id === "star" ? "med" : "none"}
              height="100%"
            >
              <VStack gap={0} className="h-full text-center">
                <h2 className="font-display text-xl text-cream">{tier.name}</h2>
                <HStack hAlign="center" vAlign="center" gap={0} className="mt-1 h-6">
                  {tier.popular && <Badge label="Most popular" variant="warning" />}
                </HStack>
                <p className="mt-3 font-display text-[40px] font-bold leading-none text-goldbright lining-nums tabular-nums">
                  ${price.toFixed(2)}
                </p>
                <p className="mt-2 text-sm text-cream/75">
                  {billing === "monthly" ? "per month" : "per year"}
                </p>
                <p className="mt-2 text-base text-cream lining-nums tabular-nums">
                  <span className="font-display text-xl">
                    {tier.credits.toLocaleString()}
                  </span>{" "}
                  credits a month
                </p>
                {billing === "annual" && (
                  <p className="mt-1 text-sm font-semibold text-goldbright lining-nums tabular-nums">
                    Save $<CountUp value={tier.savings} /> a year
                  </p>
                )}
                <ul className="mt-4 space-y-2 text-left text-sm text-cream/85">
                  {tier.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <div className="mt-auto pt-6">
                  <Button
                    label={`Choose ${tier.name}`}
                    variant={tier.id === "star" ? "primary" : "secondary"}
                    isDisabled
                    width="100%"
                  />
                </div>
              </VStack>
            </Card>
          );
          return (
            <article
              key={tier.id}
              data-tier={tier.id}
              className={`relative h-full rounded-3xl ${
                tier.id === "star"
                  ? "sm:-translate-y-4 shadow-[0_24px_48px_-24px_rgba(212,175,55,0.55)]"
                  : ""
              }`}
            >
              {tier.id === "star" ? (
                <StarBorder radius="1.5rem" className="star-border-frame--block h-full" animated>
                  {card}
                </StarBorder>
              ) : (
                card
              )}
            </article>
          );
        })}
      </Grid>

      <p className="mt-6 text-center text-sm text-cream/75">
        Subscriptions open soon — Oracle packs available now.{" "}
        <Link href="/oracles" className="font-semibold text-goldbright underline">
          See Oracle packs
        </Link>
      </p>

      <section className="mt-12" aria-labelledby="topups-heading">
        <h2 id="topups-heading" className="text-center font-display text-3xl text-goldbright">
          Top up any time
        </h2>
        <HStack hAlign="center" gap={0} className="mt-3">
          <Badge label="Coming soon" variant="neutral" />
        </HStack>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-cream/75">
          Top-ups launch with subscriptions: 1,000 credits for $9.99 and
          3,000 for $24.99. Purchased credits never expire.
        </p>
        <Grid columns={{ minWidth: 280, max: 2 }} gap={4} maxWidth="42rem" className="mx-auto mt-6">
          {TOPUPS.map((topup) => (
            <Card key={topup.credits} padding={4}>
              <VStack gap={0} className="text-center">
                <p className="font-display text-3xl font-bold text-goldbright lining-nums tabular-nums">
                  ${topup.price.toFixed(2)}
                </p>
                <p className="mt-2 text-base text-cream lining-nums tabular-nums">
                  <span className="font-display text-xl">
                    {topup.credits.toLocaleString()}
                  </span>{" "}
                  credits
                </p>
                <p className="mt-1 text-sm text-cream/75">Never expires</p>
              </VStack>
            </Card>
          ))}
        </Grid>
      </section>

      <section className="mt-12" aria-labelledby="costs-heading">
        <h2 id="costs-heading" className="text-center font-display text-3xl text-goldbright">
          What a reading costs
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-cream/75">
          Planned costs for subscriptions — readings cost 1 Oracle each
          today.
        </p>
        <ul className="mx-auto mt-6 max-w-md space-y-2 text-sm text-cream/85">
          {CREDIT_COSTS.map((cost) => (
            <li
              key={cost.label}
              className="flex items-baseline justify-between border-b border-gold/15 pb-2"
            >
              <span>{cost.label}</span>
              <span className="font-semibold text-goldbright lining-nums tabular-nums">
                {cost.credits} credits
              </span>
            </li>
          ))}
        </ul>
      </section>
    </Section>
  );
}
