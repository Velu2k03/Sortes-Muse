import SpreadsClient from "./SpreadsClient";

export const metadata = {
  title: "Tarot Readings",
  description:
    "Choose your tarot spread: Quick Insight, Past Present Future, or the Celtic Cross. Your first full reading is free.",
  alternates: { canonical: "/spreads" },
};

export default function SpreadsPage() {
  return <SpreadsClient />;
}
