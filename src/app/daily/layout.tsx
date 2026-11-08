import type { Metadata } from "next";
import { pageSocial } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Daily Card",
  description: "Your free daily tarot card, drawn once a day for reflection. One card, one short reflection, free every day, with no account and no payment card needed.",
  alternates: { canonical: "/daily" },
  ...pageSocial({ title: "Daily Card", description: "Your free daily tarot card, drawn once a day for reflection. One card, one short reflection, free every day, with no account and no payment card needed.", path: "/daily" }),
};

export default function DailyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
