import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Daily Card",
  description: "Your free daily tarot card, drawn once a day for reflection.",
  alternates: { canonical: "/daily" },
};

export default function DailyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
