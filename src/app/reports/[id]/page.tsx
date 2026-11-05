import type { Metadata } from "next";
import ReportDetailClient from "./ReportDetailClient";

export const metadata: Metadata = {
  title: "Report",
  description: "A saved Sortes keep-forever report: its interpretation and its data tables.",
};

export default function ReportDetail() {
  return <ReportDetailClient />;
}
