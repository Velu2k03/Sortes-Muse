import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

// Batch 1 (C1/C2, review test gaps): source-scan guards for the label
// wiring and the follow-up failure handling. A hook test would need a
// React renderer the repo does not have; these guards fail loudly if
// a call site reverts to the device flag or the old failure handling.
// Same pattern as point-6-9.test.ts.
const src = (p: string) => readFileSync(p, "utf8").replace(/\s+/g, " ");

describe("Batch 1 wiring guards", () => {
  it("C1: every free label reads through isFreeAvailableFor, never the raw device flag", () => {
    for (const p of [
      "src/app/intake/[slug]/useIntakeFlow.ts",
      "src/components/ReadingFlow.tsx",
      "src/app/spreads/SpreadsClient.tsx",
    ]) {
      expect(src(p)).toContain("isFreeAvailableFor({");
    }
    // No call site still decides "free" from freeReadingUsed() alone.
    expect(src("src/app/intake/[slug]/useIntakeFlow.ts")).not.toContain(
      "spread.slug === \"quick-insight\" && !usedFree"
    );
    expect(src("src/components/ReadingFlow.tsx")).not.toContain(
      "spread.slug === \"quick-insight\" && !usedFree"
    );
  });

  it("C1: AuthProvider clears the server free flag on sign-out", () => {
    const auth = src("src/components/AuthProvider.tsx");
    expect(auth).toContain("setFreeReadingAvailable(null)");
    expect(auth).toContain("refreshFreeStatus");
    expect(auth).toContain("deviceHeldSession");
  });

  it("C1: the intake re-reads the flag before the cost is shown or acted on", () => {
    const flow = src("src/app/intake/[slug]/useIntakeFlow.ts");
    expect(flow).toContain("refreshFreeStatus()");
    expect(flow).toContain("step === \"confirm\"");
  });

  it("C2: the failure refresh matches on the attempt id only, never on question text", () => {
    const detail = src("src/app/reading/[id]/useReadingDetail.ts");
    expect(detail).toContain("f.id === attemptId");
    expect(detail).not.toContain("f.question === q");
  });

  it("C2: the pending id is cleared on the saved-by-server paths, not only on success", () => {
    const detail = src("src/app/reading/[id]/useReadingDetail.ts");
    const clears = detail.split("clearPendingAttemptId(attemptScope)").length - 1;
    expect(clears).toBeGreaterThanOrEqual(3);
  });

  it("C2: an unknown refresh never claims 'No Oracle was spent'", () => {
    const detail = src("src/app/reading/[id]/useReadingDetail.ts");
    expect(detail).toContain("We could not confirm whether your follow-up was saved.");
    expect(detail).toContain("Retrying is safe: the same request will not charge twice.");
  });

  it("C2: a not-saved refresh says 'not saved yet', never 'No Oracle was spent'", () => {
    const detail = src("src/app/reading/[id]/useReadingDetail.ts");
    expect(detail).toContain("was not saved yet");
  });

  it("C2: the refresh runs only on ambiguous failures (5xx without a server error body, or a throw)", () => {
    const detail = src("src/app/reading/[id]/useReadingDetail.ts");
    expect(detail).toContain("res.status >= 500 && !data.error");
  });
});
