import type { Metadata } from "next";
import { pageSocial } from "@/lib/seo";
import ReportsClient from "./ReportsClient";
import type { ReportType } from "@/lib/reports";

export const metadata: Metadata = {
  title: "Reports",
  description:
    "Reports: a transit report for a chosen date, a year-ahead reading, or a relationship comparison. 300 credits per report, reports never expire.",
  alternates: { canonical: "/reports" },
  ...pageSocial({ title: "Reports", description: "Reports: a transit report for a chosen date, a year-ahead reading, or a relationship comparison. 300 credits per report, reports never expire.", path: "/reports" }),
};

export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  // URL state sync (all-pages fix 4): ?type=year-ahead or
  // ?type=comparison opens on that report type; Transit is the
  // default, so it (and any bad value) is Transit. Reading
  // searchParams makes this route dynamic, the same pattern /deck
  // and /horoscope already use.
  const sp = await searchParams;
  const raw = Array.isArray(sp.type) ? sp.type[0] : sp.type;
  const initialType: ReportType =
    raw === "year-ahead" || raw === "comparison" ? raw : "transit";
  return <ReportsClient initialType={initialType} />;
}
