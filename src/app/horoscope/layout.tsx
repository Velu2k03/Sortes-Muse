import type { Metadata } from "next";
import { pageSocial } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Daily Horoscope",
  description: "A general sun-sign reflection for today or this week, written for Sortes. Free, unsaved, and not a personal reading or a prediction. Choose your sign to begin.",
  alternates: { canonical: "/horoscope" },
  ...pageSocial({ title: "Daily Horoscope", description: "A general sun-sign reflection for today or this week, written for Sortes. Free, unsaved, and not a personal reading or a prediction. Choose your sign to begin.", path: "/horoscope" }),
};

export default function HoroscopeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
