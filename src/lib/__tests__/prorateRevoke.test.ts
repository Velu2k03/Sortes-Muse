import { describe, it, expect } from "vitest";
import { prorateRevoke } from "@/lib/db/orders";

describe("prorateRevoke (audit item 10)", () => {
  it("rounds down so the customer is never revoked more than refunded", () => {
    expect(prorateRevoke(12, 7.99, 400, 0)).toBe(6); // 6.008 -> 6
    expect(prorateRevoke(5, 3.99, 100, 0)).toBe(1); // 1.25 -> 1
    expect(prorateRevoke(5, 3.99, 70, 0)).toBe(0); // 0.88 -> 0
  });
  it("full, unknown, or oversized refunds revoke the whole pack", () => {
    expect(prorateRevoke(30, 14.99, 1499, 0)).toBe(30);
    expect(prorateRevoke(30, 14.99, undefined, 0)).toBe(30);
    expect(prorateRevoke(30, 14.99, 999999, 0)).toBe(30);
  });
  it("subtracts what was already revoked, never below 0", () => {
    expect(prorateRevoke(12, 7.99, 799, 6)).toBe(6);
    expect(prorateRevoke(12, 7.99, 400, 6)).toBe(0);
    expect(prorateRevoke(12, 7.99, 100, 6)).toBe(0);
  });
  // F1: totalCents is Math.round(amountDollars * 100), never the raw product.
  it("F1: float products do not skew the proration base", () => {
    // Brief said 7.99 * 100 = 798.9999999999999; in JS it is exactly 799 (checked), as are
    // 3.99 and 14.99. Float error appears for taxed totals, so 1.10 is the pinning case.
    // 7.99 -> 799 cents: a 799-cent refund is the full pack.
    expect(prorateRevoke(12, 7.99, 799, 0)).toBe(12);
    // 1.10 * 100 = 110.00000000000001. Unrounded, a 110-cent refund would be
    // "partial" (floor(10 * 110 / 110.00000000000001) = 9); rounded it is the full 10.
    expect(1.1 * 100).not.toBe(110);
    expect(prorateRevoke(10, 1.1, 110, 0)).toBe(10);
  });
});
