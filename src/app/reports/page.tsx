import type { Metadata } from "next";
import ReportsClient from "./ReportsClient";

export const metadata: Metadata = {
  title: "Reports",
  description:
    "Keep-forever reports: a transit report for a chosen date, a year-ahead reading, or a relationship comparison. 1 Oracle per report, reports never expire.",
  alternates: { canonical: "/reports" },
};

export default function Reports() {
  return <ReportsClient />;
}
