import type { ReportType } from "@/lib/reports";

// Batch 2 (B2), 2026-11-23: the transit report returned HTTP 503 on
// every live attempt (4 of 4, no spend), and the cause could not be
// pinned from this pass (no runtime-log access; validation passes on
// realistic transit text in tests). Rather than ship a button that
// always fails, /reports offers only the types below. The "transit"
// ReportType, its builder, the API route branch, and saved transit
// reports all stay valid, so re-enabling it later is a one-line change
// here once the live failure is diagnosed.
export const OFFERED_REPORT_TYPES: readonly ReportType[] = ["year-ahead", "comparison"];

export const DEFAULT_REPORT_TYPE: ReportType = "year-ahead";

/** Map a ?type= value to an offered report type, or the default. */
export function offeredReportType(raw: string | null | undefined): ReportType {
  return OFFERED_REPORT_TYPES.find((t) => t === raw) ?? DEFAULT_REPORT_TYPE;
}
