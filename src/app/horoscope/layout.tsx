import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Daily Horoscope",
  description: "A general sun-sign reflection for today or this week, written for Sortes. Free, unsaved, and not a personal reading.",
  alternates: { canonical: "/horoscope" },
};

export default function HoroscopeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
