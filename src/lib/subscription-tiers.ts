/*
 * Phase 2 batch 2: subscription tiers, the server-side source of truth
 * for monthly-grant math. Velu's exact numbers from the Phase 2 plan
 * (remodel-subscription-plan-2026-11-14.md): Spark $7.99 / 1,000 credits,
 * Star $14.99 / 2,500, Moon $29.99 / 6,000. Annual is the same monthly
 * drip — an annual subscription is charged up front but granted one
 * month at a time, never all upfront.
 *
 * The pricing page (src/components/PricingClient.tsx) keeps its own
 * copy of these numbers alongside prices and feature lists for display;
 * this module is the one the grant logic reads. If a tier amount ever
 * changes, change both and say so in the commit.
 */

export type SubscriptionTierId = "spark" | "star" | "moon";

export interface SubscriptionTier {
  id: SubscriptionTierId;
  name: string;
  /** Credits granted per month (monthly plans, and each monthly drip of an annual plan). */
  monthlyCredits: number;
  /** Rollover cap: two months of the plan. The monthly balance is never granted above this. */
  rolloverCap: number;
}

export const SUBSCRIPTION_TIERS: Record<SubscriptionTierId, SubscriptionTier> = {
  spark: { id: "spark", name: "Spark", monthlyCredits: 1000, rolloverCap: 2000 },
  star: { id: "star", name: "Star", monthlyCredits: 2500, rolloverCap: 5000 },
  moon: { id: "moon", name: "Moon", monthlyCredits: 6000, rolloverCap: 12000 },
};

export function isSubscriptionTierId(value: unknown): value is SubscriptionTierId {
  return value === "spark" || value === "star" || value === "moon";
}

export function tierForId(tier: SubscriptionTierId): SubscriptionTier {
  return SUBSCRIPTION_TIERS[tier];
}

/**
 * How many monthly credits a grant may actually add: the plan's monthly
 * amount, cut down to whatever room is left under the two-month cap.
 * At or above the cap the grant is 0 — the period is still consumed
 * (the grant row is recorded), so an unspent balance can never be
 * topped back up by retrying the same period.
 */
export function grantableMonthly(currentMonthly: number, tier: SubscriptionTier): number {
  return Math.max(0, Math.min(tier.monthlyCredits, tier.rolloverCap - currentMonthly));
}

/** 1 Oracle = 300 credits at conversion. The converted balance is purchased, so it never expires. */
export const ORACLE_TO_CREDITS = 300;

/**
 * Pure conversion math. Oracle balances are whole Oracles (the users
 * balance is an INTEGER); a fractional or negative input is a caller
 * bug, not a rounding decision, so it throws instead of guessing.
 */
export function oracleToCredits(oracles: number): number {
  if (!Number.isInteger(oracles) || oracles < 0) {
    throw new Error("oracleToCredits: oracles must be a non-negative integer.");
  }
  return oracles * ORACLE_TO_CREDITS;
}
