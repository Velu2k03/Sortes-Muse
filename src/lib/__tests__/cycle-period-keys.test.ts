import { describe, it, expect } from "vitest";
import { cyclePeriodKeys } from "@/lib/db/subscriptions";

/**
 * Pure unit tests for cyclePeriodKeys (no DB): the YYYY-MM keys
 * in one billing cycle, from the invoice's creation month.
 * The webhook passes these to revokeAllSubscriptionGrants so a
 * refund only touches the refunded invoice's cycle.
 */
describe("cyclePeriodKeys", () => {
  it("monthly returns just the invoice's month", () => {
    expect(cyclePeriodKeys("2026-12-15T00:00:00.000Z", "monthly")).toEqual(["2026-12"]);
    expect(cyclePeriodKeys("2027-01-01T00:00:00.000Z", "monthly")).toEqual(["2027-01"]);
  });

  it("annual returns 12 months from the invoice's month, rolling the year", () => {
    expect(cyclePeriodKeys("2026-11-15T00:00:00.000Z", "annual")).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
      "2027-05",
      "2027-06",
      "2027-07",
      "2027-08",
      "2027-09",
      "2027-10",
    ]);
  });

  it("annual from a January start stays in the same year", () => {
    expect(cyclePeriodKeys("2027-01-15T00:00:00.000Z", "annual")[0]).toBe("2027-01");
    expect(cyclePeriodKeys("2027-01-15T00:00:00.000Z", "annual")[11]).toBe("2027-12");
  });

  it("accepts a Date, not just a string", () => {
    expect(cyclePeriodKeys(new Date("2026-11-15T00:00:00.000Z"), "monthly")).toEqual(["2026-11"]);
  });

  it("throws on an invalid date instead of emitting NaN keys", () => {
    expect(() => cyclePeriodKeys("not-a-date", "monthly")).toThrow(/invalid start date/);
    expect(() => cyclePeriodKeys(new Date("bad"), "annual")).toThrow(/invalid start date/);
  });
});
