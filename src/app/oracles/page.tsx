import { Suspense } from "react";
import { pageSocial } from "@/lib/seo";
import CreditsPage from "./CreditsClient";
import Icon from "@/components/Icon";
import PackBuyButton from "./PackBuyButton";
import TopUpBuyButton from "./TopUpBuyButton";
import { CREDIT_PACKS, SITE_URL, perReadingPrice } from "@/lib/site";
import { CREDIT_COSTS_ENABLED, TOPUPS } from "@/lib/subscription-tiers";

// Cheapest per Oracle gets the Best value badge.
const bestValueId = CREDIT_PACKS.reduce((a, b) =>
  b.price / b.readings < a.price / a.readings ? b : a,
).id;

// Phase 2 batch 3: once the credit-cost flag is ON, packs stop
// being sold and this page sells top-ups instead (1,000 credits
// $9.99, 3,000 $24.99, never expire). Until then it is the pack
// page it has always been. The flag is a build-time constant, so
// both the metadata and the rendered cards follow it.
export const metadata = CREDIT_COSTS_ENABLED
  ? {
      title: "Top up credits",
      description:
        "Top up your Sortes credits: 1,000 for $9.99 or 3,000 for $24.99. Purchased credits never expire.",
      alternates: { canonical: "/oracles" },
      ...pageSocial({
        title: "Top up credits",
        description:
          "Top up your Sortes credits: 1,000 for $9.99 or 3,000 for $24.99. Purchased credits never expire.",
        path: "/oracles",
      }),
    }
  : {
      title: "Oracles",
      description: "Top up your Sortes Oracles: 5 for $3.99, 12 for $7.99, or 30 for $14.99. 1 Oracle opens 1 full reading, and Oracles never expire.",
      alternates: { canonical: "/oracles" },
      ...pageSocial({ title: "Oracles", description: "Top up your Sortes Oracles: 5 for $3.99, 12 for $7.99, or 30 for $14.99. 1 Oracle opens 1 full reading, and Oracles never expire.", path: "/oracles" }),
    };

export default function Credits() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* AF-070: Product/Offer JSON-LD for the three packs, priced
          from CREDIT_PACKS (the same source the page renders). When
          the flag is ON the offers are the top-ups instead. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: CREDIT_COSTS_ENABLED ? "Sortes credits" : "Sortes Oracles",
            description: CREDIT_COSTS_ENABLED
              ? "Credit top-ups for Sortes tarot readings. Purchased credits never expire."
              : "Oracle packs for Sortes tarot readings. 1 Oracle opens 1 full reading. Oracles never expire.",
            brand: { "@type": "Brand", name: "Sortes" },
            offers: CREDIT_COSTS_ENABLED
              ? TOPUPS.map((t) => ({
                  "@type": "Offer",
                  name: `${t.credits.toLocaleString()} credits`,
                  price: t.price.toFixed(2),
                  priceCurrency: "USD",
                  availability: "https://schema.org/InStock",
                  url: `${SITE_URL}/oracles`,
                }))
              : CREDIT_PACKS.map((p) => ({
                  "@type": "Offer",
                  name: `${p.name} — ${p.readings} Oracles`,
                  price: p.price.toFixed(2),
                  priceCurrency: "USD",
                  availability: "https://schema.org/InStock",
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
        <p className="flex items-center justify-center gap-2 text-xs uppercase tracking-[0.35em] text-gold"><Icon name="coin" size={18} />{CREDIT_COSTS_ENABLED ? "Credits" : "Oracles"}</p>
        <h1 className="mt-3 font-display text-5xl text-goldbright sm:text-6xl">
          {CREDIT_COSTS_ENABLED ? "Top up credits" : "Oracle packs"}
        </h1>
        <p className="mt-4 text-sm text-cream/75">
          {CREDIT_COSTS_ENABLED
            ? "Credits for tarot readings, birth charts, and reports. Purchased credits never expire."
            : "Every pack works for tarot readings, birth charts, and reports."}
        </p>
        <p className="mt-2 text-sm font-semibold text-goldbright">
          {CREDIT_COSTS_ENABLED
            ? "1-card readings 100 credits. 3-card readings 200. Charts 300. Follow-ups 50."
            : "Daily card free. First reading free. Then $0.50-$0.80 per reading."}
        </p>
      </div>

      <div
        className={`mt-6 grid items-stretch gap-4 ${
          CREDIT_COSTS_ENABLED ? "sm:grid-cols-2" : "sm:grid-cols-3"
        }`}
      >
        {CREDIT_COSTS_ENABLED
          ? TOPUPS.map((t) => (
              <div
                key={t.id}
                className="relative h-full rounded-3xl border border-gold/20 bg-panel/60 p-4"
              >
                <div className="flex h-full flex-col text-center">
                  <h2 className="font-display text-xl text-cream">
                    {t.credits.toLocaleString()} credits
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
                      label={`Buy ${t.credits.toLocaleString()} for $${t.price.toFixed(2)}`}
                    />
                  </div>
                </div>
              </div>
            ))
          : CREDIT_PACKS.map((p) => {
              const best = p.id === bestValueId;
              return (
                <div
                  key={p.id}
                  className={`relative h-full rounded-3xl border p-4 ${
                    p.popular
                      ? "border-gold/70 bg-panel/80 shadow-[0_24px_48px_-24px_rgba(212,175,55,0.55)]"
                      : "border-gold/20 bg-panel/60"
                  }`}
                >
                  <div className="flex h-full flex-col text-center">
                    <h2 className="font-display text-xl text-cream">{p.name}</h2>
                    <div className="mt-1 flex h-6 items-center justify-center">
                      {p.popular && (
                        <span className="inline-block rounded-full bg-[#14100a] px-3 py-1 text-xs font-bold text-[#f4d03f]">
                          Most popular
                        </span>
                      )}
                      {best && (
                        <span className="inline-block rounded-full bg-[#14100a] px-3 py-1 text-xs font-bold text-[#f4d03f]">
                          Best value
                        </span>
                      )}
                    </div>
                    <p className="mt-3 font-display text-[40px] font-bold leading-none text-goldbright lining-nums tabular-nums">
                      ${p.price.toFixed(2)}
                    </p>
                    <p className="mt-2 text-base text-cream lining-nums tabular-nums">
                      <span className="font-display text-xl">{p.readings}</span> Oracles · ${perReadingPrice(p)} per Oracle
                    </p>
                    <div className="mt-auto pt-4">
                      <PackBuyButton packId={p.id} label={`Buy ${p.readings} for $${p.price.toFixed(2)}`} />
                    </div>
                  </div>
                </div>
              );
            })}
      </div>

      <div className="mx-auto mt-6 max-w-xl space-y-2 text-center text-sm text-cream/75">
        <p>
          Pay with cards, PayPal, Apple Pay, or Google Pay through Lemon
          Squeezy. Available methods can vary by region and device.
        </p>
        <p>
          Prices are in US dollars (USD). Checkout shows the full amount,
          including any applicable taxes or fees.
        </p>
        <p>
          {CREDIT_COSTS_ENABLED
            ? "Unused credit top-ups can be refunded within 14 days of purchase."
            : "Unused Oracle packs can be refunded within 14 days of purchase."}
        </p>
      </div>

      <Suspense fallback={null}>
        <CreditsPage />
      </Suspense>
    </div>
  );
}
