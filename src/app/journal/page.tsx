import HistoryPage from "./HistoryClient";

export const metadata = {
  title: "Journal",
  description: "Your saved tarot readings, kept on this device.",
  alternates: { canonical: "/journal" },
  // AF-072: a personal page, not indexable content.
  robots: { index: false, follow: true },
};

export default function History() {
  return <HistoryPage />;
}
