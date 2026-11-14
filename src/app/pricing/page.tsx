import { Theme } from "@astryxdesign/core/theme";
// The built theme object, imported directly (not via the generated
// src/astryx-themes.ts, which also imports sortes.css — global CSS
// may only load from the root layout, so the CSS comes in through
// globals.css instead). The Theme provider scopes the theme to
// this page only; the rest of the app is untouched.
import { sortesTheme } from "@/themes/sortes/sortes.js";
import { pageSocial } from "@/lib/seo";
import { subscriptionsConfigured, topUpsConfigured } from "@/lib/lemonsqueezy";
import { CREDIT_COSTS_ENABLED } from "@/lib/subscription-tiers";
import PricingClient from "@/components/PricingClient";

// Phase 2 batch 3: the page reads the Lemon Squeezy variant config
// at request time, so the tier / top-up buttons enable as soon as
// the variant ids land in env (no rebuild needed). Until then the
// client shows the "Coming soon" state. The buttons ALSO need the
// credit flag ON: a subscription/top-up grants credits, and while
// the spend path still charges 1 per reading those credits would
// buy 1,000 readings for $7.99. The flag flips first in the
// cutover, so the checkout opens only once spending uses credits.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pricing",
  description:
    "Sortes subscriptions: Spark $7.99 a month for 1,000 credits, Star $14.99 for 2,500, Moon $29.99 for 6,000. Annual billing saves $16, $30, or $60 a year. Top-ups from $9.99, never expire.",
  alternates: { canonical: "/pricing" },
  ...pageSocial({
    title: "Pricing",
    description:
      "Sortes subscriptions: Spark $7.99 a month for 1,000 credits, Star $14.99 for 2,500, Moon $29.99 for 6,000. Annual billing saves $16, $30, or $60 a year. Top-ups from $9.99, never expire.",
    path: "/pricing",
  }),
};

export default function Pricing() {
  return (
    <Theme theme={sortesTheme} mode="dark">
      <PricingClient
        subscriptionsEnabled={subscriptionsConfigured() && CREDIT_COSTS_ENABLED}
        topupsEnabled={topUpsConfigured() && CREDIT_COSTS_ENABLED}
      />
    </Theme>
  );
}
