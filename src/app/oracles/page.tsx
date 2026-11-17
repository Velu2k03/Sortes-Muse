import { Suspense } from "react";
import { pageSocial } from "@/lib/seo";
import CreditsPage from "./CreditsClient";
import TopUpBuyButton from "./TopUpBuyButton";
import InfoHint from "@/components/InfoHint";
import { SITE_URL } from "@/lib/site";
import { topUpsConfigured } from "@/lib/lemonsqueezy";
import { CREDIT_COSTS_ENABLED, TOPUPS } from "@/lib/subscription-tiers";

// Packs retired (Velu, 2026-11-16, D1): this page sells top-ups
// only (1,000 Oracles $9.99, 3,000 $24.99, never expire). The
// purchase buttons stay disabled until the credit flag is ON and
// the Lemon Squeezy top-up variants are configured, same as the
// pricing page top-ups.
//
// fa-IR hydration fix (all-pages follow-up, 2026-11-17): a bare
// toLocaleString call uses the runtime default locale, so this server
// page renders "1,000" while a fa-IR client hydrates Persian digits
// and React throws #418. Pin en-US so server and client agree;
// visible formatting for Latin-locale users is unchanged.
const CREDITS_LOCALE = "en-US";
export const metadata = {
  title: "Top up Oracles",
  description:
    "Top up your Sortes Oracles: 1,000 for $9.99 or 3,000 for $24.99. Purchased Oracles never expire.",
  alternates: { canonical: "/oracles" },
  ...pageSocial({
    title: "Top up Oracles",
    description:
      "Top up your Sortes Oracles: 1,000 for $9.99 or 3,000 for $24.99. Purchased Oracles never expire.",
    path: "/oracles",
  }),
};

export default function Credits() {
  // Codex P2 (PR #118): the buttons and the JSON-LD availability
  // are gated on the same readiness the pricing page uses — the
  // flag ON and the Lemon Squeezy top-up variants configured.
  // Until then the buttons read "Not yet open" and the offers
  // are OutOfStock, so visitors and search engines are not sent
  // to a checkout that 503s.
  const topupsEnabled = topUpsConfigured() && CREDIT_COSTS_ENABLED;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* AF-070: Product/Offer JSON-LD for the top-ups, priced
          from TOPUPS (the same source the page renders). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: "Sortes Oracles",
            description:
              "Oracle top-ups for Sortes tarot readings. Purchased Oracles never expire.",
            brand: { "@type": "Brand", name: "Sortes" },
            offers: TOPUPS.map((t) => ({
              "@type": "Offer",
              name: `${t.credits.toLocaleString(CREDITS_LOCALE)} Oracles`,
              price: t.price.toFixed(2),
              priceCurrency: "USD",
              availability: topupsEnabled
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
              url: `${SITE_URL}/oracles`,
            })),
          }),
        }}
      />
      {/* Lightsite fix V13: this header renders on the server, so
          the H1 is in the initial HTML. It used to live in the
          client component, which suspends on useSearchParams, so
          crawlers saw no H1 at all. */}
      <div className="text-center">
        <h1 className="mt-3 font-display text-5xl text-goldbright sm:text-6xl">
          Top up Oracles
        </h1>
        <p className="mt-4 text-sm text-cream/75">
          Top up your Oracles for tarot readings, birth charts, and reports.
        </p>
        <p className="mt-2 text-sm font-semibold text-goldbright">
          One reading costs 1 Oracle.
        </p>
      </div>

      <div className="mt-6 grid items-stretch gap-4 sm:grid-cols-2">
        {TOPUPS.map((t) => (
          <div
            key={t.id}
            className="relative h-full rounded-3xl border border-gold/20 bg-panel/60 p-4"
          >
            <div className="flex h-full flex-col text-center">
              <h2 className="font-display text-xl text-cream">
                {t.credits.toLocaleString(CREDITS_LOCALE)} Oracles
              </h2>
              <div className="mt-1 flex h-6 items-center justify-center" />
              <p className="mt-3 font-display text-[40px] font-bold leading-none text-goldbright lining-nums tabular-nums">
                ${t.price.toFixed(2)}
              </p>
              <p className="mt-2 text-base text-cream lining-nums tabular-nums">
                Never expires
              </p>
              <div className="mt-auto pt-4">
                <TopUpBuyButton
                  topUpId={t.id}
                  label={`Buy ${t.credits.toLocaleString(CREDITS_LOCALE)} for $${t.price.toFixed(2)}`}
                  enabled={topupsEnabled}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* UX audit Phase 2, F37: three small-print paragraphs used
          to sit here (payment methods, USD/taxes, 14-day refund).
          Phase 7 (7.2): only the refund window stays visible, it is
          decision-critical. The payment methods and taxes move
          behind an info icon. The "never expire" promise is said
          once on this page, on the top-up cards above; it is not
          repeated here. */}
      <div className="mx-auto mt-6 max-w-xl text-center text-sm text-cream/75">
        <p>
          Unused top-ups can be refunded within 14 days of purchase.{" "}
          <InfoHint label="About payment methods">
            Pay with cards, PayPal, Apple Pay, or Google Pay through
            Lemon Squeezy, where available in your region. Prices are in
            US dollars; checkout shows the full amount, including any
            applicable taxes or fees.
          </InfoHint>
        </p>
      </div>

      <Suspense fallback={null}>
        <CreditsPage />
      </Suspense>
    </div>
  );
}
