import type { Metadata } from "next";
import { pageSocial } from "@/lib/seo";
import ReportsClient from "./ReportsClient";
import { offeredReportType } from "@/lib/report-offer";

export const metadata: Metadata = {
  title: "Reports",
  description:
    "Reports: a year-ahead reading or a relationship comparison. 300 credits per report, reports never expire.",
  alternates: { canonical: "/reports" },
  ...pageSocial({ title: "Reports", description: "Reports: a year-ahead reading or a relationship comparison. 300 credits per report, reports never expire.", path: "/reports" }),
};

export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  // URL state sync (all-pages fix 4): ?type=comparison opens on that
  // report type; Year-ahead is the default, so it (and any bad value,
  // including ?type=transit while transit is not offered, Batch 2 B2)
  // is Year-ahead. Reading searchParams makes this route dynamic, the
  // same pattern /deck and /horoscope already use.
  const sp = await searchParams;
  const raw = Array.isArray(sp.type) ? sp.type[0] : sp.type;
  const initialType = offeredReportType(raw);
  return <ReportsClient initialType={initialType} />;
}
