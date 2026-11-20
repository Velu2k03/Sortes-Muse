import ChartsClient from "./ChartsClient";
import { pageSocial } from "@/lib/seo";
import type { ChartSystem } from "@/lib/chart-submit";

export const metadata = {
  title: "Birth Charts",
  description: "Calculate a Ziwei, Western, or Vedic birth chart. Calculation is free and unsaved; interpretation is 300 credits, first interpretation per system free.",
  alternates: { canonical: "/charts" },
  ...pageSocial({ title: "Birth Charts", description: "Calculate a Ziwei, Western, or Vedic birth chart. Calculation is free and unsaved; interpretation is 300 credits, first interpretation per system free.", path: "/charts" }),
};

export default async function ChartsPage({
  searchParams,
}: {
  searchParams: Promise<{ system?: string | string[] }>;
}) {
  // URL state sync (all-pages fix 4): ?system=vedic or ?system=ziwei
  // opens on that system; Western is the default, so it (and any
  // bad value) is Western. Reading searchParams makes this route
  // dynamic, the same pattern /deck and /horoscope already use.
  const sp = await searchParams;
  const raw = Array.isArray(sp.system) ? sp.system[0] : sp.system;
  const initialSystem: ChartSystem =
    raw === "vedic" || raw === "ziwei" ? raw : "western";
  return <ChartsClient initialSystem={initialSystem} />;
}
