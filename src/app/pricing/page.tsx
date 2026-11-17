import { pageSocial } from "@/lib/seo";
import { subscriptionsConfigured, topUpsConfigured } from "@/lib/lemonsqueezy";
import { CREDIT_COSTS_ENABLED } from "@/lib/subscription-tiers";
import PricingClient from "@/components/PricingClient";

// Phase 2 batch 3: the page reads the Lemon Squeezy variant config
// at request time, so the tier / top-up buttons enable as soon as
// the variant ids land in env (no rebuild needed). Until then the
// buttons show "Not yet open" (Batch 4.3: no "Coming soon" badge —
// Velu, 2026-11-16). The buttons ALSO need the credit flag ON: a
// subscription/top-up grants credits, and while the spend path
// still charges 1 per reading those credits would buy 1,000
// readings for $9.99. The flag flips first in the cutover, so the
// checkout opens only once spending uses credits.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pricing",
  description:
    "Sortes subscriptions: Spark $9.99 a month for 1,000 Oracles, Star $19.99 for 2,500, Moon $39.99 for 6,000. Annual billing saves $16, $30, or $60 a year. Top-ups from $9.99, never expire.",
  alternates: { canonical: "/pricing" },
  ...pageSocial({
    title: "Pricing",
    description:
      "Sortes subscriptions: Spark $9.99 a month for 1,000 Oracles, Star $19.99 for 2,500, Moon $39.99 for 6,000. Annual billing saves $16, $30, or $60 a year. Top-ups from $9.99, never expire.",
    path: "/pricing",
  }),
};

export default async function Pricing({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string | string[] }>;
}) {
  // URL state sync (all-pages fix 4): ?billing=annual opens on
  // Annual; anything else (including a bad value) is Monthly, the
  // default. Reading searchParams makes this route dynamic, the
  // same pattern /deck and /horoscope already use.
  const sp = await searchParams;
  const raw = Array.isArray(sp.billing) ? sp.billing[0] : sp.billing;
  const initialBilling = raw === "annual" ? "annual" : "monthly";
  // No Astryx <Theme> wrapper here (pricing theme-clobber fix,
  // 2026-11-17): the Theme provider's only job on this page was
  // scoping the built sortes theme via data-astryx-theme="sortes"
  // on its wrapper, but as the root Theme it also synced
  // data-theme="dark" to <html> and removed the attribute on
  // unmount — clobbering Sortes' own html[data-theme] (stored
  // light flipped to dark ~500ms after paint; navigating away
  // left data-theme null and the user stuck on dark). The scope
  // now lives on PricingClient's root Section instead, which
  // spreads data-* props onto its outer div (BaseProps allows
  // data-* attributes), so the @scope'd sortes.css rules apply
  // exactly as before with no provider and no <html> writes.
  // The sortes theme object itself is still built and its CSS
  // still loads from globals.css; only the provider is gone.
  // Nothing in src/ consumes the Theme context (no useTheme),
  // and the theme is built (__built: true), so no runtime style
  // injection is lost either.
  return (
    <PricingClient
      subscriptionsEnabled={subscriptionsConfigured() && CREDIT_COSTS_ENABLED}
      topupsEnabled={topUpsConfigured() && CREDIT_COSTS_ENABLED}
      initialBilling={initialBilling}
    />
  );
}
