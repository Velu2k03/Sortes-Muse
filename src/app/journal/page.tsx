import HistoryPage from "./HistoryClient";
import { pageSocial } from "@/lib/seo";

const DESCRIPTION =
  "Your saved tarot readings, kept on this device. Revisit past spreads and the cards you drew whenever you want to look back on a past question.";

export const metadata = {
  title: "Journal",
  description: DESCRIPTION,
  alternates: { canonical: "/journal" },
  // AF-072: a personal page, not indexable content.
  robots: { index: false, follow: true },
  // Batch 4d: its own OG/Twitter instead of the generic homepage block.
  ...pageSocial({
    title: "Journal",
    description: DESCRIPTION,
    path: "/journal",
  }),
};

export default function History() {
  return <HistoryPage />;
}
