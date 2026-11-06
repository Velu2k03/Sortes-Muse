import { describe, expect, it } from "vitest";
import { SAMPLE_TRANSIT_REPORT } from "@/lib/sample-report";

// Phase E (item 9): the sample report must stay a full paid-style
// report, not drift back to a layout list.
describe("SAMPLE_TRANSIT_REPORT", () => {
  it("is a full 350-550 word report with one step and one reflection question", () => {
    const words = SAMPLE_TRANSIT_REPORT.trim().split(/\s+/).length;
    expect(words).toBeGreaterThanOrEqual(350);
    expect(words).toBeLessThanOrEqual(550);
    expect(SAMPLE_TRANSIT_REPORT).toMatch(/one practical step/i);
    expect((SAMPLE_TRANSIT_REPORT.match(/\?/g) ?? []).length).toBe(1);
    expect(SAMPLE_TRANSIT_REPORT).toContain("Gochara");
  });
});
