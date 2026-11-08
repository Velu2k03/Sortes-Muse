import ChartsClient from "./ChartsClient";
import { pageSocial } from "@/lib/seo";

export const metadata = {
  title: "Birth Charts",
  description: "Calculate a Ziwei, Western, or Vedic birth chart. Calculation is free and unsaved; interpretation is 1 Oracle, first interpretation per system free.",
  alternates: { canonical: "/charts" },
  ...pageSocial({ title: "Birth Charts", description: "Calculate a Ziwei, Western, or Vedic birth chart. Calculation is free and unsaved; interpretation is 1 Oracle, first interpretation per system free.", path: "/charts" }),
};

export default function ChartsPage() {
  return <ChartsClient />;
}
