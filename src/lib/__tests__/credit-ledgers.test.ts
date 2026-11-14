import { describe, it, expect } from "vitest";
import {
  ORACLE_TO_CREDITS,
  SUBSCRIPTION_TIERS,
  grantableMonthly,
  oracleToCredits,
} from "../subscription-tiers";
import {
  applyGrantToUser,
  applyRevokeToUser,
  applySpendToUser,
  spendFromBalances,
} from "../db/ledgers";
import type { DbUser } from "../db/types";

/**
 * Phase 2 batch 2: two-ledger credit system, pure logic (no DB).
 * The Postgres behaviour (idempotent grants, conversion rows, spend
 * sites) is pinned in db-credit-ledgers.test.ts.
 */

function legacyUser(credits: number): DbUser {
  // A local file written before 008: no ledger keys at all.
  return { id: "u1", email: "u1@example.com", credits, created_at: "2026-11-14T00:00:00.000Z" };
}

describe("subscription tiers (Velu's exact numbers)", () => {
  it("Spark 1,000/month, cap 2,000; Star 2,500/5,000; Moon 6,000/12,000", () => {
    expect(SUBSCRIPTION_TIERS.spark.monthlyCredits).toBe(1000);
    expect(SUBSCRIPTION_TIERS.spark.rolloverCap).toBe(2000);
    expect(SUBSCRIPTION_TIERS.star.monthlyCredits).toBe(2500);
    expect(SUBSCRIPTION_TIERS.star.rolloverCap).toBe(5000);
    expect(SUBSCRIPTION_TIERS.moon.monthlyCredits).toBe(6000);
    expect(SUBSCRIPTION_TIERS.moon.rolloverCap).toBe(12000);
  });

  it("the cap is exactly two months of the plan for every tier", () => {
    for (const tier of Object.values(SUBSCRIPTION_TIERS)) {
      expect(tier.rolloverCap).toBe(2 * tier.monthlyCredits);
    }
  });
});

describe("grantableMonthly (capped rollover)", () => {
  it("grants the full month below the cap", () => {
    expect(grantableMonthly(0, SUBSCRIPTION_TIERS.spark)).toBe(1000);
    expect(grantableMonthly(500, SUBSCRIPTION_TIERS.spark)).toBe(1000);
  });

  it("grants only the room left under the cap", () => {
    expect(grantableMonthly(1500, SUBSCRIPTION_TIERS.spark)).toBe(500);
    expect(grantableMonthly(4000, SUBSCRIPTION_TIERS.star)).toBe(1000);
    expect(grantableMonthly(11000, SUBSCRIPTION_TIERS.moon)).toBe(1000);
  });

  it("grants 0 at or above the cap (the period is still consumed)", () => {
    expect(grantableMonthly(2000, SUBSCRIPTION_TIERS.spark)).toBe(0);
    expect(grantableMonthly(5000, SUBSCRIPTION_TIERS.star)).toBe(0);
    expect(grantableMonthly(13000, SUBSCRIPTION_TIERS.moon)).toBe(0);
  });
});

describe("oracleToCredits (1 Oracle = 300 credits)", () => {
  it("converts whole balances", () => {
    expect(ORACLE_TO_CREDITS).toBe(300);
    expect(oracleToCredits(0)).toBe(0);
    expect(oracleToCredits(1)).toBe(300);
    expect(oracleToCredits(5)).toBe(1500);
    expect(oracleToCredits(12)).toBe(3600);
    expect(oracleToCredits(30)).toBe(9000);
  });

  it("a zero balance converts to zero (still a conversion, not an error)", () => {
    expect(oracleToCredits(0)).toBe(0);
  });

  it("rejects fractional and negative inputs instead of rounding them", () => {
    expect(() => oracleToCredits(1.5)).toThrow(/non-negative integer/);
    expect(() => oracleToCredits(-1)).toThrow(/non-negative integer/);
    expect(() => oracleToCredits(Number.NaN)).toThrow(/non-negative integer/);
  });
});

describe("spendFromBalances (monthly spent first)", () => {
  it("spends monthly first and leaves purchased alone", () => {
    expect(spendFromBalances({ monthly: 10, purchased: 5, total: 15 }, 7)).toEqual({
      monthly: 3,
      purchased: 5,
      total: 8,
    });
  });

  it("spills into purchased only after monthly is exhausted", () => {
    expect(spendFromBalances({ monthly: 10, purchased: 5, total: 15 }, 12)).toEqual({
      monthly: 0,
      purchased: 3,
      total: 3,
    });
  });

  it("spends the exact total to zero", () => {
    expect(spendFromBalances({ monthly: 10, purchased: 5, total: 15 }, 15)).toEqual({
      monthly: 0,
      purchased: 0,
      total: 0,
    });
  });

  it("spends 1 (the live per-reading cost) from monthly when monthly is available", () => {
    expect(spendFromBalances({ monthly: 1, purchased: 5, total: 6 }, 1)).toEqual({
      monthly: 0,
      purchased: 5,
      total: 5,
    });
  });

  it("spends 1 from purchased when monthly is empty", () => {
    expect(spendFromBalances({ monthly: 0, purchased: 5, total: 5 }, 1)).toEqual({
      monthly: 0,
      purchased: 4,
      total: 4,
    });
  });

  it("returns null and spends nothing when the total is insufficient", () => {
    expect(spendFromBalances({ monthly: 10, purchased: 5, total: 15 }, 16)).toBeNull();
    expect(spendFromBalances({ monthly: 0, purchased: 0, total: 0 }, 1)).toBeNull();
  });

  it("rejects a zero or negative spend instead of minting credits", () => {
    expect(() => spendFromBalances({ monthly: 5, purchased: 5, total: 10 }, 0)).toThrow(/positive/);
    expect(() => spendFromBalances({ monthly: 5, purchased: 5, total: 10 }, -3)).toThrow(/positive/);
  });
});

describe("local-JSON ledger helpers", () => {
  it("applySpendToUser treats a legacy user (no ledger keys) as all-purchased", () => {
    const u = legacyUser(5);
    expect(applySpendToUser(u, 2)).toBe(true);
    expect(u.monthly_credits).toBe(0);
    expect(u.purchased_credits).toBe(3);
    expect(u.credits).toBe(3);
  });

  it("applySpendToUser returns false for a missing user or an insufficient balance, unchanged", () => {
    expect(applySpendToUser(undefined, 1)).toBe(false);
    const u = legacyUser(1);
    expect(applySpendToUser(u, 2)).toBe(false);
    expect(u.credits).toBe(1);
    expect(u.purchased_credits).toBe(1);
  });

  it("applyGrantToUser grants into the named ledger and re-syncs the total", () => {
    const u = legacyUser(0);
    applyGrantToUser(u, "monthly", 1000);
    expect(u.monthly_credits).toBe(1000);
    expect(u.purchased_credits).toBe(0);
    expect(u.credits).toBe(1000);
    applyGrantToUser(u, "purchased", 300);
    expect(u.purchased_credits).toBe(300);
    expect(u.credits).toBe(1300);
  });

  it("applyRevokeToUser takes purchased first, then monthly, clamped at 0", () => {
    const u = legacyUser(0);
    applyGrantToUser(u, "monthly", 10);
    applyGrantToUser(u, "purchased", 3);
    applyRevokeToUser(u, 5);
    expect(u.purchased_credits).toBe(0);
    expect(u.monthly_credits).toBe(8);
    expect(u.credits).toBe(8);
    applyRevokeToUser(u, 99);
    expect(u.monthly_credits).toBe(0);
    expect(u.purchased_credits).toBe(0);
    expect(u.credits).toBe(0);
  });
});
