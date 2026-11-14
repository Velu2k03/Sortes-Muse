import { Theme } from "@astryxdesign/core/theme";
// The built theme object, imported directly (not via the generated
// src/astryx-themes.ts, which also imports sortes.css — global CSS
// may only load from the root layout, so the CSS comes in through
// globals.css instead). The Theme provider scopes the theme to
// this page only; the rest of the app is untouched.
import { sortesTheme } from "@/themes/sortes/sortes.js";
import { pageSocial } from "@/lib/seo";
import PricingClient from "@/components/PricingClient";

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
      <PricingClient />
    </Theme>
  );
}
