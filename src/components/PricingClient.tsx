"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

// Astryx scoped pilot (pricing page only, Velu 2026-11-14). UI only
// until Phase 2 batch 3: the tier buttons were disabled
// placeholders. Now the buttons wire to checkout when the Lemon
// Squeezy variants are configured (props from the server page,
// which reads the env vars): subscriptions via
// POST /api/checkout/subscription (kind "subscription"), top-ups
// the same route (kind "topup"). Sign-in is required — a guest
// gets the account page (the sign-in entry point) instead.
// Packs retired (Velu, 2026-11-16, D1): no pack UI anywhere;
// /oracles sells top-ups only.
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
// Batch 4.3: the per-reading costs (100 / 200 / 300 / 50) are
// gone from the lists and the "What a reading costs" table —
// they described the cancelled credit cutover. The product spends
// 1 Oracle per reading, so the lists name the products only.

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

// Velu's exact numbers, never change them: Spark $9.99 / 1,000
// Oracles, Star $19.99 / 2,500, Moon $39.99 / 6,000. Annual:
// $103.88 / $209.88 / $419.88. Savings: 9.99 x 12 - 103.88 = $16,
// 19.99 x 12 - 209.88 = $30, 39.99 x 12 - 419.88 = $60.
const TIERS: Tier[] = [
  {
    id: "spark",
    name: "Spark",
    monthly: 9.99,
    annual: 103.88,
    credits: 1000,
    savings: 16,
    popular: false,
    features: [
      "1-card readings",
      "3-card readings",
      "Follow-up questions",
      "Daily card free, every day",
    ],
  },
  {
    id: "star",
    name: "Star",
    monthly: 19.99,
    annual: 209.88,
    credits: 2500,
    savings: 30,
    popular: true,
    features: [
      "Everything in Spark, plus 1,500 more Oracles a month",
      "Chart readings",
      "Your journal and reading history",
    ],
  },
  {
    id: "moon",
    name: "Moon",
    monthly: 39.99,
    annual: 419.88,
    credits: 6000,
    savings: 60,
    popular: false,
    features: [
      "Everything in Star, plus 3,500 more Oracles a month",
      "Reports: transit, year-ahead, and relationship",
    ],
  },
];

const TOPUPS = [
  { credits: 1000, price: 9.99 },
  { credits: 3000, price: 24.99 },
];

export default function PricingClient({
  subscriptionsEnabled = false,
  topupsEnabled = false,
}: {
  subscriptionsEnabled?: boolean;
  topupsEnabled?: boolean;
}) {
  const [billing, setBilling] = useState<Billing>("monthly");
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Phase 2 batch 3: one checkout call for a tier or a top-up.
  // 401 means the visitor is not signed in — send them to the
  // account page (the sign-in entry point) instead of failing.
  const checkout = async (kind: "subscription" | "topup", key: string) => {
    setError(null);
    setProcessing(key);
    try {
      const res = await fetch("/api/checkout/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, key }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push("/account");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Could not start checkout. Please try again.");
      if (!data.url) throw new Error("Could not start checkout. Please try again.");
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setProcessing(null);
    }
  };

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
        <p className="text-sm text-gold">Pricing</p>
        <h1 className="mt-3 font-display text-5xl text-goldbright sm:text-6xl">
          Choose your plan
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-cream/75">
          Monthly Oracles for readings, charts, and reports. Top-ups
          arrive with subscriptions. Purchased Oracles never expire.
        </p>
      </VStack>

      <HStack hAlign="center" gap={0} className="mt-8">
        <button
          type="button"
          aria-pressed={billing === "monthly"}
          onClick={() => setBilling("monthly")}
          className={`min-h-11 rounded-l-full border px-5 py-2 text-sm font-semibold ${
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
          className={`min-h-11 rounded-r-full border px-5 py-2 text-sm font-semibold ${
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
              <VStack gap={0} className="pricing-card-dark h-full text-center">
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
                  Oracles a month
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
                    label={
                      processing === `${tier.id}-${billing}`
                        ? "Starting checkout…"
                        : !subscriptionsEnabled
                          ? "Not yet open"
                          : `Choose ${tier.name}`
                    }
                    variant={tier.id === "star" ? "primary" : "secondary"}
                    isDisabled={!subscriptionsEnabled}
                    isLoading={processing === `${tier.id}-${billing}`}
                    width="100%"
                    className="min-h-11"
                    onClick={() => void checkout("subscription", `${tier.id}-${billing}`)}
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
                tier.id === "star" ? "shadow-gold-lg" : ""
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

      {error && (
        <p className="mt-6 text-center text-sm alert-error-text">{error}</p>
      )}

      <p className="mt-6 text-center text-sm text-cream/75">
        {subscriptionsEnabled ? (
          <>
            Manage or cancel anytime from your{" "}
            <Link href="/account" className="font-semibold text-goldbright underline">
              account
            </Link>
            .{" "}
          </>
        ) : (
          // Packs retired (Velu, 2026-11-16, D1): /oracles sells
          // top-ups, not packs, so the footer points there.
          <Link href="/oracles" className="font-semibold text-goldbright underline">
            See top-ups
          </Link>
        )}
      </p>

      <section className="mt-12" aria-labelledby="topups-heading">
        <h2 id="topups-heading" className="text-center font-display text-3xl text-goldbright">
          Top up any time
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-cream/75">
          1,000 Oracles for $9.99 and 3,000 for $24.99. Purchased Oracles
          never expire.
        </p>
        <Grid columns={{ minWidth: 280, max: 2 }} gap={4} maxWidth="42rem" className="mx-auto mt-6">
          {TOPUPS.map((topup) => (
            <Card key={topup.credits} padding={4}>
              <VStack gap={0} className="pricing-card-dark text-center">
                <p className="font-display text-3xl font-bold text-goldbright lining-nums tabular-nums">
                  ${topup.price.toFixed(2)}
                </p>
                <p className="mt-2 text-base text-cream lining-nums tabular-nums">
                  <span className="font-display text-xl">
                    {topup.credits.toLocaleString()}
                  </span>{" "}
                  Oracles
                </p>
                <p className="mt-1 text-sm text-cream/75">Never expires</p>
                <Button
                  label={
                    processing === `topup-${topup.credits}`
                      ? "Starting checkout…"
                      : !topupsEnabled
                        ? "Not yet open"
                        : `Top up ${topup.credits.toLocaleString()} Oracles`
                  }
                  variant="secondary"
                  isDisabled={!topupsEnabled}
                  isLoading={processing === `topup-${topup.credits}`}
                  width="100%"
                  onClick={() => void checkout("topup", `topup-${topup.credits}`)}
                  className="mt-4 min-h-11"
                />
              </VStack>
            </Card>
          ))}
        </Grid>
      </section>

    </Section>
  );
}
