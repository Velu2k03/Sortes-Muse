import { Suspense } from "react";
import { pageSocial } from "@/lib/seo";
import CreditsPage from "./CreditsClient";
import Icon from "@/components/Icon";
import PackBuyButton from "./PackBuyButton";
import { CREDIT_PACKS, SITE_URL, perReadingPrice } from "@/lib/site";

// Cheapest per Oracle gets the Best value badge.
const bestValueId = CREDIT_PACKS.reduce((a, b) =>
  b.price / b.readings < a.price / a.readings ? b : a,
).id;

export const metadata = {
  title: "Oracles",
  description: "Top up your Sortes Oracles: 5 for $3.99, 12 for $7.99, or 30 for $14.99. 1 Oracle opens 1 full reading, and Oracles never expire. No subscription, ever.",
  alternates: { canonical: "/oracles" },
  ...pageSocial({ title: "Oracles", description: "Top up your Sortes Oracles: 5 for $3.99, 12 for $7.99, or 30 for $14.99. 1 Oracle opens 1 full reading, and Oracles never expire. No subscription, ever.", path: "/oracles" }),
};

export default function Credits() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* AF-070: Product/Offer JSON-LD for the three packs, priced
          from CREDIT_PACKS (the same source the page renders). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: "Sortes Oracles",
            description:
              "Oracle packs for Sortes tarot readings. 1 Oracle opens 1 full reading. Oracles never expire.",
            brand: { "@type": "Brand", name: "Sortes" },
            offers: CREDIT_PACKS.map((p) => ({
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
        <p className="flex items-center justify-center gap-2 text-xs uppercase tracking-[0.35em] text-gold"><Icon name="coin" size={18} />Oracles</p>
        <h1 className="mt-3 font-display text-5xl text-goldbright sm:text-6xl">
          Oracle packs
        </h1>
        <p className="mt-4 text-sm text-cream/75">
          Every pack works for tarot readings, birth charts, and reports.
        </p>
        <p className="mt-2 text-sm font-semibold text-goldbright">
          Daily card free. First reading free. Then $0.50-$0.80 per reading. Every reading costs 1 Oracle, whatever the spread. No tiers, no surprises.
        </p>
      </div>

      <div className="mt-6 grid items-stretch gap-4 sm:grid-cols-3">
        {CREDIT_PACKS.map((p) => {
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
        <p>Unused Oracle packs can be refunded within 14 days of purchase.</p>
      </div>

      <Suspense fallback={null}>
        <CreditsPage />
      </Suspense>
    </div>
  );
}
