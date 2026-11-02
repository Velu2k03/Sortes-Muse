import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Card Meanings",
  description: "Browse all 78 Rider-Waite tarot card meanings.",
  alternates: { canonical: "/deck" },
};

export default function DeckLayout({ children }: { children: React.ReactNode }) {
  return children;
}
