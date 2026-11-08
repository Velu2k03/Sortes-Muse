import type { Metadata } from "next";
import { pageSocial } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Birth Card",
  description: "Find your tarot birth card from your birth date, with its personality and soul cards explained. Calculated in your browser only, nothing is sent anywhere.",
  alternates: { canonical: "/birth-card" },
  ...pageSocial({ title: "Birth Card", description: "Find your tarot birth card from your birth date, with its personality and soul cards explained. Calculated in your browser only, nothing is sent anywhere.", path: "/birth-card" }),
};

export default function BirthCardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
