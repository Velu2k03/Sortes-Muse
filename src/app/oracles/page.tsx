import { Suspense } from "react";
import { pageSocial } from "@/lib/seo";
import { CREDIT_PACKS, SITE_URL } from "@/lib/site";
import CreditsPage from "./CreditsClient";
import Icon from "@/components/Icon";

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
          Your balance
        </h1>
      </div>
      <Suspense fallback={null}>
        <CreditsPage />
      </Suspense>
    </div>
  );
}
