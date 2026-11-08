import type { Metadata } from "next";
import { pageSocial } from "@/lib/seo";
import { APP_SHORT } from "@/lib/site";

// Phase 4C (4.10a): this layout defines a plain-string title, and a
// title-defining layout breaks the root layout's "%s | Sortes"
// template for its child segments, so /deck/[slug] pages rendered
// with no suffix at all (verified live: "The Fool Tarot Card
// Meaning" with no "| Sortes"). The template is repeated here so the
// card pages get exactly one suffix, like every other route. The
// default keeps /deck itself as "Card Meanings | Sortes".
export const metadata: Metadata = {
  title: {
    template: `%s | ${APP_SHORT}`,
    default: "Card Meanings",
  },
  description: "Browse all 78 Rider-Waite tarot card meanings: upright and reversed, love, career, and yes-or-no guidance for every card in the deck, plus its story.",
  alternates: { canonical: "/deck" },
  ...pageSocial({ title: "Card Meanings", description: "Browse all 78 Rider-Waite tarot card meanings: upright and reversed, love, career, and yes-or-no guidance for every card in the deck, plus its story.", path: "/deck" }),
};

export default function DeckLayout({ children }: { children: React.ReactNode }) {
  return children;
}
