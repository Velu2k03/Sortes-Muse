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
// Batch 2 (B3), 2026-11-23: the description promised per-card topic
// guidance (relationships, work, and binary answers) that does not
// exist; src/data/cards.json holds only keywords and upright/reversed
// meanings. The copy now says what
// exists (pinned by src/lib/__tests__/broken-paths-batch2.test.ts).
const DECK_DESCRIPTION =
  "Browse all 78 Rider-Waite tarot card meanings: upright and reversed meanings and keywords for every card in the deck.";

export const metadata: Metadata = {
  title: {
    template: `%s | ${APP_SHORT}`,
    default: "Card Meanings",
  },
  description: DECK_DESCRIPTION,
  alternates: { canonical: "/deck" },
  ...pageSocial({ title: "Card Meanings", description: DECK_DESCRIPTION, path: "/deck" }),
};

export default function DeckLayout({ children }: { children: React.ReactNode }) {
  return children;
}
