import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { unconfirmedMessage, requireSavedReading } from "@/lib/generate-failure";

const CLIENTS = [
  "src/app/intake/[slug]/useIntakeFlow.ts",
  "src/app/reports/ReportsClient.tsx",
  "src/app/charts/useChartsClient.ts",
];

describe("Point 1: honest failure copy", () => {
  it("client-side failure copy never claims the Oracle was not spent", () => {
    for (const noun of ["reading", "report", "interpretation"] as const) {
      const m = unconfirmedMessage(noun, "your journal");
      expect(m).toMatch(/may have been saved/);
      expect(m).toMatch(/without spending another Oracle/);
      expect(m).not.toMatch(/not spent|No Oracle was spent/i);
    }
  });

  it("no client file hard-codes 'not spent' text or appends it to server errors", () => {
    for (const f of CLIENTS) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/Oracle was not spent/);
      expect(src, f).not.toMatch(/`\$\{msg\} No Oracle was spent/);
      expect(src, f).not.toMatch(/`\$\{message\} No Oracle was spent/);
      expect(src, f).not.toMatch(/(Could not|could not) [^"]*No Oracle was spent/);
    }
  });

  it("clients send an attempt id and use the shared failure copy", () => {
    expect(readFileSync(CLIENTS[0], "utf8")).toMatch(/readingId: attemptId,/);
    expect(readFileSync(CLIENTS[1], "utf8")).toMatch(/reportId: attemptId/);
    expect(readFileSync(CLIENTS[2], "utf8")).toMatch(/readingId: attemptId/);
    for (const f of CLIENTS) expect(readFileSync(f, "utf8"), f).toContain("unconfirmedMessage(");
  });
});

describe("Point 3: no local reading for a signed-in user", () => {
  it("throws when a signed-in response lacks the saved reading", () => {
    expect(() => requireSavedReading(true, undefined)).toThrow(/no saved reading/);
  });
  it("returns the server row for signed-in, and lets guests build their own", () => {
    const row = { id: "srv" };
    expect(requireSavedReading(true, row)).toBe(row);
    expect(requireSavedReading(false, undefined)).toBeUndefined();
  });
});
