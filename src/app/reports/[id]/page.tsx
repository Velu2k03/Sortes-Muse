import type { Metadata } from "next";
import ReportDetailClient from "./ReportDetailClient";
import { pageSocial } from "@/lib/seo";

const DESCRIPTION =
  "A saved Sortes keep-forever report: its full interpretation and its data tables, kept for you to revisit any time.";

// Batch 4d: this page inherited the generic homepage OG block. It
// gets its own OG/Twitter now, with the real report URL.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: "Report",
    description: DESCRIPTION,
    robots: { index: false, follow: true },
    ...pageSocial({
      title: "Report",
      description: DESCRIPTION,
      path: `/reports/${id}`,
    }),
  };
}

export default function ReportDetail() {
  return <ReportDetailClient />;
}
