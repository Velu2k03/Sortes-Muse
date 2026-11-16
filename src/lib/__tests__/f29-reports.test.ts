/**
 * UX audit Phase 2, F29 (reports).
 * The H1 was one vague word ("Reports") and a label was technical
 * ("Hour (0-23)"). The H1 now says what the reports are; the label
 * is just "Hour" (the input enforces 0-23 with min/max).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("F29 reports H1 and label say what they are", () => {
  it("the H1 names astrology reports", () => {
    const reports = src("src/app/reports/ReportsClient.tsx");
    expect(reports).toContain(">Your astrology reports</h1>");
    expect(reports).not.toContain(">Reports</h1>");
  });

  it("the hour label is plain; the input still enforces 0-23", () => {
    const reports = src("src/app/reports/ReportsClient.tsx");
    expect(reports).toContain("Hour\n              </label>");
    expect(reports).not.toContain("Hour (0-23)");
    expect(reports).toContain('min={0}');
    expect(reports).toContain('max={23}');
  });
});
