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
});
