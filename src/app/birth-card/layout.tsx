import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Birth Card",
  description: "Find your tarot birth card from your birth date, calculated in your browser only.",
  alternates: { canonical: "/birth-card" },
};

export default function BirthCardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
