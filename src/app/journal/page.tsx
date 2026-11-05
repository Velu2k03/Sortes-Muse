import HistoryPage from "./HistoryClient";

export const metadata = {
  title: "Journal",
  description: "Your saved tarot readings, kept on this device.",
  alternates: { canonical: "/journal" },
};

export default function History() {
  return <HistoryPage />;
}
