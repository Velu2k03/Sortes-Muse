"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { showFailureToast, dismissFailureToast } from "@/lib/failure-toast";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Section } from "@astryxdesign/core/Section";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Grid } from "@astryxdesign/core/Grid";
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
      "Everything in Spark",
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
      "Everything in Star",
      "Reports: transit, year-ahead, and relationship",
    ],
  },
];

const TOPUPS = [
  { credits: 1000, price: 9.99 },
  { credits: 3000, price: 24.99 },
];

// Sonner full use (2026-11-17): checkout is the one async flow with
// no failure toast yet, it only set inline error text. A genuine
// checkout failure gets the same title-plus-Retry toast as the other
// four failure paths. A 401 is not a failure, it redirects to the
// account page, so it gets no toast.
const CHECKOUT_FAILED = "Checkout failed";

export default function PricingClient({
  subscriptionsEnabled = false,
  topupsEnabled = false,
  initialBilling = "monthly",
}: {
  subscriptionsEnabled?: boolean;
  topupsEnabled?: boolean;
  // URL state sync (all-pages fix 4): the server page reads
  // ?billing=annual and passes it in, so a refresh or a shared
  // link opens on Annual instead of resetting to Monthly.
  initialBilling?: Billing;
}) {
  const [billing, setBilling] = useState<Billing>(initialBilling);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL state sync (all-pages fix 4): Monthly is the default, so
  // it is omitted and the URL stays clean (/pricing); Annual is
  // written as ?billing=annual, the value the audit named.
  // router.replace, not push: toggling billing is not a navigation
  // step, so Back leaves the page instead of stepping through
  // Monthly/Annual. scroll: false keeps the toggle in view.
  const syncBilling = (next: Billing) => {
    setBilling(next);
    router.replace(
      next === "annual" ? "/pricing?billing=annual" : "/pricing",
      { scroll: false },
    );
  };
  // Back/forward: the URL is the source of truth when it changes
  // without a toggle click. The server re-renders with a new
  // initialBilling prop, but useState keeps the mounted value, so
  // the param has to be read back here. No-op on mount and on our
  // own replace, where the param already matches the state.
  useEffect(() => {
    const next: Billing =
      searchParams.get("billing") === "annual" ? "annual" : "monthly";
    // Phase 4C lint: setState deferred a microtask past the effect,
    // the same pattern the codebase already uses for this rule.
    if (next !== billing) queueMicrotask(() => setBilling(next));
  }, [searchParams, billing]);

  // Sonner full use (2026-11-17): see CHECKOUT_FAILED above.
  // The toast outlives the page (one app-wide Toaster): leaving the
  // page drops it so its Retry cannot run against an unmounted page.
  useEffect(() => () => dismissFailureToast(CHECKOUT_FAILED), []);

  // Phase 2 batch 3: one checkout call for a tier or a top-up.
  // 401 means the visitor is not signed in — send them to the
  // account page (the sign-in entry point) instead of failing.
  const checkout = async (kind: "subscription" | "topup", key: string) => {
    setError(null);
    dismissFailureToast(CHECKOUT_FAILED);
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
      showFailureToast(CHECKOUT_FAILED, () => void checkout(kind, key));
    } finally {
      setProcessing(null);
    }
  };

  // Pricing tiers, editorial layout (Velu, 2026-11-17): the old
  // lock is CANCELLED, identical-size tier cards with Star marked
  // by border/badge/glow only. Per Griffin Video 3 Fix 1 (focal
  // point, one action per screen) Star is the focal panel, not
  // equal to the other two. Per Tristen Video 1 Fix 4 (break the
  // center) the tier section is left-aligned and asymmetric. Per
  // Taste, no three feature cards; hierarchy from weight and
  // colour. Spark and Moon are quiet hairline rows, grouped by
  // spacing, not boxes (Griffin Fix 2). Tier names, prices,
  // Oracle counts, features, checkout buttons and the toggle are
  // unchanged. The Star panel keeps the dark card scope; the
  // rows sit on the light paper, so their text uses the page's
  // own light-mode classes (text-cream resolves to dark ink
  // there, text-goldbright to dark gold).
  const star = TIERS.find((tier) => tier.id === "star") ?? TIERS[1];
  const others = TIERS.filter((tier) => tier.id !== "star");
  const starPrice = billing === "monthly" ? star.monthly : star.annual;

  // One tier-button site in the file: Star's panel and the
  // Spark/Moon rows share it, so the button count the wiring
  // tests pin (tier + top-up) stays two.
  const tierButton = (tier: Tier) => (
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
      className="mt-6 min-h-11"
      onClick={() => void checkout("subscription", `${tier.id}-${billing}`)}
    />
  );

  return (
    // Page-level layout is Astryx Section / Stack / Grid (repo rule:
    // components handle layout, no raw <div> wrappers). There are
    // no raw <div> wrappers left: the old mt-auto spacer inside
    // each tier Card is gone with the equal-height cards — the
    // Star panel and the Spark/Moon rows no longer share a row of
    // equal cards, so the button sits directly after the features
    // with mt-6. The tier section is a two-column Grid
    // (minWidth 440, max 2): Star's focal panel on one side,
    // Spark and Moon as quiet hairline rows on the other; it
    // collapses to a single column, Star first, on narrow screens.
    <Section variant="transparent" maxWidth="64rem" padding={8} paddingInline={4} className="mx-auto">
      <VStack gap={0} className="text-center">
        {/* UX audit Phase 2, F14 (Hallmark re-run): the "Pricing"
            eyebrow above the H1 is gone. The H1 already says what
            the page is, and Hallmark gate 54 is never an eyebrow. */}
        <h1 className="mt-3 font-display text-5xl text-goldbright sm:text-6xl">
          Choose your plan
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-cream/75">
          Monthly Oracles for readings, charts, and reports. Top-ups
          are one-time purchases, separate from subscriptions.
        </p>
      </VStack>

      <HStack hAlign="center" gap={0} className="mt-8">
        <button
          type="button"
          aria-pressed={billing === "monthly"}
          onClick={() => syncBilling("monthly")}
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
          onClick={() => syncBilling("annual")}
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

      <Grid columns={{ minWidth: 440, max: 2 }} gap={10} className="mt-6">
        {/* Star, the focal tier: one large panel, gold border and
            glow, badge top-left, the section's primary action. */}
        <article data-tier="star" className="relative h-full rounded-3xl shadow-gold-lg">
          <Card padding={8} elevation="med" height="100%" className="border-gold">
            <VStack gap={0} className="pricing-card-dark h-full text-left">
              {star.popular && <Badge label="Most popular" variant="warning" />}
              <h2 className="mt-3 font-display text-4xl text-goldbright">{star.name}</h2>
              <p className="mt-4 font-display text-5xl font-bold leading-none text-goldbright lining-nums tabular-nums">
                ${starPrice.toFixed(2)}
              </p>
              <p className="mt-2 text-sm text-cream/75">
                {billing === "monthly" ? "per month" : "per year"}
              </p>
              <p className="mt-2 text-base text-cream lining-nums tabular-nums">
                <span className="font-display text-xl">
                  {star.credits.toLocaleString()}
                </span>{" "}
                Oracles a month
              </p>
              {billing === "annual" && (
                <p className="mt-1 text-sm font-semibold text-goldbright lining-nums tabular-nums">
                  Save $<CountUp value={star.savings} /> a year
                </p>
              )}
              <ul className="mt-4 space-y-2 text-left text-sm text-cream/85">
                {star.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              {tierButton(star)}
            </VStack>
          </Card>
        </article>
        {/* Spark and Moon, quiet supporting rows: no boxes, no
            backgrounds, separated by hairline rules only. */}
        <VStack gap={0} className="divide-y divide-gold/25">
          {others.map((tier) => {
            const price = billing === "monthly" ? tier.monthly : tier.annual;
            return (
              <VStack key={tier.id} gap={0} className="py-6 first:pt-0 last:pb-0">
                <HStack hAlign="between" gap={4} className="items-baseline">
                  <h3 className="font-display text-2xl text-goldbright">{tier.name}</h3>
                  <p className="shrink-0 font-display text-2xl font-bold text-cream lining-nums tabular-nums">
                    ${price.toFixed(2)}
                    <span className="text-sm font-normal text-mist">
                      {billing === "monthly" ? " / month" : " / year"}
                    </span>
                  </p>
                </HStack>
                <p className="mt-2 text-sm text-cream/75">
                  {tier.credits.toLocaleString()} Oracles a month
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
                {tierButton(tier)}
              </VStack>
            );
          })}
        </VStack>
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
          // Packs retired (Velu, 2026-11-16, D1): top-ups live in
          // the section below, so the footer points there.
          <Link href="#topups-heading" className="font-semibold text-goldbright underline">
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
