import SpreadsClient from "./SpreadsClient";
import { pageSocial } from "@/lib/seo";

export const metadata = {
  title: "Tarot Readings",
  description:
    "Choose your tarot spread: Quick Insight, topic spreads, or the Celtic Cross. Your first Quick Insight reading is free, no payment card needed.",
  alternates: { canonical: "/spreads" },
  ...pageSocial({ title: "Tarot Readings", description: "Choose your tarot spread: Quick Insight, topic spreads, or the Celtic Cross. Your first Quick Insight reading is free, no payment card needed.", path: "/spreads" }),
};

export default function SpreadsPage() {
  return <SpreadsClient />;
}
