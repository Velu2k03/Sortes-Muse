import SpreadsClient from "./SpreadsClient";

export const metadata = {
  title: "Tarot Readings",
  description:
    "Choose your tarot spread: Quick Insight, topic spreads, or the Celtic Cross. Your first Quick Insight reading is free.",
  alternates: { canonical: "/spreads" },
};

export default function SpreadsPage() {
  return <SpreadsClient />;
}
