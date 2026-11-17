"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { showFailureToast, dismissFailureToast } from "@/lib/failure-toast";
import NumberFlow from "@number-flow/react";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Section } from "@astryxdesign/core/Section";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Grid } from "@astryxdesign/core/Grid";

// All-pages fix 6 (NumberFlow swap, 2026-11-17): NumberFlow replaces
// the in-house CountUp here. 500ms is CountUp's transitions.dev
// number pop-in token (--duration-very-slow); the easing is
// easeOutCubic, the same curve CountUp used (1 - (1 - p)^3).
// useGrouping: false keeps CountUp's ungrouped rendering ("2500",
// not "2,500"). respectMotionPreference defaults to true in
// NumberFlow, the same reduced-motion skip CountUp had. NumberFlow's
// own default is 900ms, so the 500ms must stay explicit.
// locales: "en-US" pins Latin digits. Without it NumberFlow uses
// the visitor's browser locale, and a locale such as fa-IR formats
// integers with non-Latin digits this version does not support,
// while the deleted CountUp always rendered Latin digits. It is a
// separate `locales` prop, not a key of `format` (which is
// Intl.NumberFormatOptions and has no locales field).
const NUMBERFLOW_TIMING = { duration: 500, easing: "cubic-bezier(0.215, 0.61, 0.355, 1)" };
const NUMBERFLOW_FORMAT = { useGrouping: false };
const NUMBERFLOW_LOCALES = "en-US";

// fa-IR hydration fix (all-pages follow-up, 2026-11-17): a bare
// toLocaleString call uses the runtime default locale, so the server
// renders "1,000" while a fa-IR client renders Persian digits and
// React throws #418 on hydration. Pin en-US so server and client
// agree; visible formatting for Latin-locale users is unchanged.
const CREDITS_LOCALE = "en-US";

// Same isomorphic layout-effect alias the codebase already uses
// (Counter.tsx, AnimatedContent.tsx): useLayoutEffect on the
// client, useEffect on the server, so the first-paint pill
// positioning below never warns during SSR.
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

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
  // history.replaceState, NOT router.replace: a router navigation
  // re-renders the page mid-toggle, and the searchParams effect
  // below then reads the stale param (Monthly) and flips billing
  // back to Monthly, then forward to Annual again, so the pill
  // flickers instead of sliding (PR #152 fix, diagnosed live:
  // annual, monthly, annual in one click). replaceState writes
  // the URL with no navigation and no re-render, so the toggle
  // slides once and stays; Back/forward still navigates, so the
  // searchParams effect below still corrects billing then. Same
  // pattern as /horoscope (HoroscopeClient syncHoroscopeUrl),
  // which uses replaceState for the same reason. replaceState
  // writes no history entry, so Back leaves the page, as before.
  const syncBilling = (next: Billing) => {
    setBilling(next);
    const qs = next === "annual" ? "?billing=annual" : "";
    window.history.replaceState(null, "", `/pricing${qs}`);
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

  // Sliding pill (transitions.dev 16-tabs-sliding, 2026-11-17):
  // the gold pill slides between Monthly and Annual instead of
  // the active button jumping its background. JS writes the
  // active button's offsetLeft/offsetWidth onto the pill; CSS
  // owns the 250ms tween (.billing-toggle-pill in globals.css).
  // First paint, resize, and webfont load position the pill
  // WITHOUT a transition (transition: none, reflow, restore),
  // so it never animates in from translateX(0)/width 0. Reduced
  // motion: the global reduced-motion block in globals.css
  // zeroes the transition, so the pill snaps.
  const pillRef = useRef<HTMLSpanElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const moveBillingPill = useCallback(
    (animate: boolean) => {
      const pill = pillRef.current;
      const tab = tabRefs.current[billing === "monthly" ? 0 : 1];
      if (!pill || !tab) return;
      if (!animate) {
        const prev = pill.style.transition;
        pill.style.transition = "none";
        pill.style.transform = `translateX(${tab.offsetLeft}px)`;
        pill.style.width = `${tab.offsetWidth}px`;
        void pill.offsetWidth;
        pill.style.transition = prev;
      } else {
        pill.style.transform = `translateX(${tab.offsetLeft}px)`;
        pill.style.width = `${tab.offsetWidth}px`;
      }
    },
    [billing],
  );
  // First paint snaps, later billing changes slide.
  const pillPositioned = useRef(false);
  useIsomorphicLayoutEffect(() => {
    moveBillingPill(pillPositioned.current);
    pillPositioned.current = true;
  }, [billing, moveBillingPill]);
  // Resize and webfont load change the buttons' widths, so
  // re-measure without animating. Subscribed ONCE on mount: the
  // effect used to depend on moveBillingPill, so it re-ran on
  // every billing change, and since document.fonts is already
  // loaded by then, its .ready snap fired as a microtask right
  // after the toggle commit, setting transition: none + reflow
  // and cancelling the in-flight 250ms slide, so the pill
  // jumped instead of sliding (PR #152 fix, diagnosed live).
  // A ref always points at the latest moveBillingPill, so the
  // once-subscribed handlers still re-measure the current
  // billing; fonts load once, so one snap is enough.
  const moveBillingPillRef = useRef(moveBillingPill);
  useEffect(() => {
    moveBillingPillRef.current = moveBillingPill;
  });
  useEffect(() => {
    const snap = () => moveBillingPillRef.current(false);
    window.addEventListener("resize", snap);
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) snap();
    });
    return () => {
      cancelled = true;
      window.removeEventListener("resize", snap);
    };
  }, []);

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
    <Section
      variant="transparent"
      maxWidth="64rem"
      padding={8}
      paddingInline={4}
      className="mx-auto"
      // Pricing theme-clobber fix (2026-11-17): the sortes theme
      // scope root. sortes.css is @scope'd to
      // [data-astryx-theme="sortes"], and this attribute used to
      // come from the Astryx <Theme> wrapper on the pricing page.
      // That wrapper is gone — as the root Theme it synced
      // data-theme="dark" to <html> and removed the attribute on
      // unmount, clobbering Sortes' own html[data-theme]. Section
      // spreads data-* props onto its outer div (BaseProps allows
      // data-* attributes), so the attribute lands on the same
      // scope root with no provider and no <html> writes. The
      // wrapper was display: contents, so removing it changes no
      // layout; its data-theme="dark" was inert (no CSS selects
      // [data-theme] except on <html>), and its color-scheme: dark
      // is preserved by the [data-astryx-theme="sortes"] rule in
      // globals.css.
      data-astryx-theme="sortes"
    >
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

      {/* Sliding pill (transitions.dev 16-tabs-sliding,
          2026-11-17): the gold pill behind the active button
          slides between Monthly and Annual. The bar carries the
          quiet border and panel background; the buttons are
          transparent, only their text colour changes. The pill
          is aria-hidden, the buttons keep aria-pressed.
          width="fit-content" + mx-auto: the bar hugs the two
          buttons instead of stretching full-width, which only
          shows now that the bar itself has a background.
          AGENTS.md self-check exception (PR #152, Codex P1):
          the pill is deliberately a raw <span>, not an Astryx
          component. No Astryx primitive fits it: it is a plain
          decorative DOM node that takes a ref and direct style
          writes (transform/width, via moveBillingPill) per the
          transitions.dev snippet, and it carries no content,
          no semantics, and no interaction. The same file
          already uses raw spans for inline text (e.g. the
          credit amounts), so this is the established pattern
          for non-component text/decorative spans here. */}
      <HStack hAlign="center" gap={0} width="fit-content" className="relative mx-auto mt-8 rounded-full border border-gold/40 bg-panel p-1">
        <span ref={pillRef} aria-hidden="true" className="billing-toggle-pill" />
        <button
          type="button"
          ref={(el) => {
            tabRefs.current[0] = el;
          }}
          aria-pressed={billing === "monthly"}
          onClick={() => syncBilling("monthly")}
          className={clsx(
            "relative z-1 min-h-11 rounded-full bg-transparent px-5 py-2 text-sm font-semibold transition-colors duration-250",
            billing === "monthly" ? "text-ink" : "text-cream",
          )}
        >
          Monthly
        </button>
        <button
          type="button"
          ref={(el) => {
            tabRefs.current[1] = el;
          }}
          aria-pressed={billing === "annual"}
          onClick={() => syncBilling("annual")}
          className={clsx(
            "relative z-1 min-h-11 rounded-full bg-transparent px-5 py-2 text-sm font-semibold transition-colors duration-250",
            billing === "annual" ? "text-ink" : "text-cream",
          )}
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
                  {star.credits.toLocaleString(CREDITS_LOCALE)}
                </span>{" "}
                Oracles a month
              </p>
              {billing === "annual" && (
                <p className="mt-1 text-sm font-semibold text-goldbright lining-nums tabular-nums">
                  Save $
                  <NumberFlow
                    value={star.savings}
                    locales={NUMBERFLOW_LOCALES}
                    format={NUMBERFLOW_FORMAT}
                    transformTiming={NUMBERFLOW_TIMING}
                  />{" "}
                  a year
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
                  {tier.credits.toLocaleString(CREDITS_LOCALE)} Oracles a month
                </p>
                {billing === "annual" && (
                  <p className="mt-1 text-sm font-semibold text-goldbright lining-nums tabular-nums">
                    Save $
                    <NumberFlow
                      value={tier.savings}
                      locales={NUMBERFLOW_LOCALES}
                      format={NUMBERFLOW_FORMAT}
                      transformTiming={NUMBERFLOW_TIMING}
                    />{" "}
                    a year
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
                    {topup.credits.toLocaleString(CREDITS_LOCALE)}
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
                        : `Top up ${topup.credits.toLocaleString(CREDITS_LOCALE)} Oracles`
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
