import { describe, it, expect } from "vitest";
import {
  buildTransitData,
  buildYearAheadData,
  buildComparisonData,
  type BirthInput,
  type SavedReport,
} from "../reports";
import { buildReportMarkdown } from "../report-markdown";

const A: BirthInput = { date: "1990-04-12", hour: 14, minute: 30, latitude: 14.3122, longitude: 121.1114, gender: "female" };
const B: BirthInput = { date: "1988-09-23", hour: null, minute: 0, latitude: 40.7128, longitude: -74.006, gender: null };

function wrap(type: SavedReport["type"], data: SavedReport["data"]): SavedReport {
  return { id: "r1", type, title: `Title ${type}`, targetLabel: "x", createdAt: "2026-05-01T10:00:00Z", data, interpretation: `Words for ${type}.`, model: "test-model" };
}

describe("buildReportMarkdown", () => {
  const cases: Array<[SavedReport, string]> = [
    [wrap("transit", buildTransitData(A, "2026-06-01")), "Gochara"],
    [wrap("year-ahead", buildYearAheadData(A, 2027)), "Monthly themes"],
    [wrap("comparison", buildComparisonData(A, B)), "Cross-aspects"],
  ];
  it.each(cases)("exports %# with no birth data", (report, marker) => {
    const md = buildReportMarkdown(report);
    expect(md).toContain(`# ${report.title}`);
    expect(md).toContain(report.interpretation);
    expect(md).toContain("This report never expires.");
    expect(md).toContain(marker);
    if (report.type === "transit") expect(md).toContain("| Transit planet | Aspect | Natal planet | Orb | State |");
    for (const s of ["1990-04-12", "1988-09-23", "14.3122", "121.1114", "40.7128", "-74.006"]) expect(md).not.toContain(s);
  });
});
