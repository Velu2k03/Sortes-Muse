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
 * A downgrade leaves an existing monthly balance above the new cap in
 * place; grants are 0 until it is spent below the cap. The cap is a
 * grant-time ceiling, not a balance clamp.
 */
export function grantableMonthly(currentMonthly: number, tier: SubscriptionTier): number {
  return Math.max(0, Math.min(tier.monthlyCredits, tier.rolloverCap - currentMonthly));
}

/**
 * Phase 2 batch 3: the Oracle-to-credit unit switch (Batch A
 * miss-check item 5 — the largest forward risk).
 *
 * Until this flag is ON, the product still spends 1 Oracle per
 * reading and grants 5/12/30 Oracles per pack — the old unit. When
 * it is ON, spend is in credits (1-card 100, 3-card 200, chart 300,
 * report 300, follow-up 50) and grants are in credits. Every
 * grant/spend/revoke/UI path reads this ONE constant, so the unit
 * can never be half-switched: a purchase landing between the
 * conversion and the code switch would otherwise be counted in the
 * wrong unit, and a revoke of an old 5-Oracle order would remove 5
 * credits instead of 1,500.
 *
 * CUTOVER (see docs/CREDIT-CUTOVER-RUNBOOK.md): flip this to true
 * ONLY as part of the cutover — deploy flag-ON first, then run the
 * Oracle conversion for all holders, then verify. The flag ships
 * OFF in this batch; flipping it is a deliberate, reviewed change,
 * never a drive-by. Do NOT flip it without the runbook.
 */
export const CREDIT_COSTS_ENABLED = false;

/** Credit cost of one reading/report/follow-up, once the flag is ON. */
export const READING_CREDIT_COSTS = {
  /** 1-card reading (quick-insight). */
  oneCard: 100,
  /** 3-card reading (past-present-future, love, career, weekly). */
  threeCard: 200,
  /** Chart reading. */
  chart: 300,
  /** Report (transit, year-ahead, relationship) — a deep reading,
      priced like a chart. Recorded decision, Batch B. */
  report: 300,
  /** One follow-up question. */
  followUp: 50,
} as const;

/**
 * Credit cost of a tarot reading by spread size, once the flag is
 * ON. 1 card = 100, 3 cards = 200; anything larger (celtic-cross,
 * 10 cards) is a deep reading at 300, the chart price. Recorded
 * decision, Batch B — the plan prices 1-card and 3-card only.
 * Flag OFF: 1 (the old Oracle unit).
 */
export function readingCostForSpreadCards(cards: number): number {
  if (!CREDIT_COSTS_ENABLED) return 1;
  if (cards <= 1) return READING_CREDIT_COSTS.oneCard;
  if (cards === 3) return READING_CREDIT_COSTS.threeCard;
  return READING_CREDIT_COSTS.chart;
}

/** Credit cost of a chart reading. Flag OFF: 1 (the old Oracle unit). */
export function chartCost(): number {
  return CREDIT_COSTS_ENABLED ? READING_CREDIT_COSTS.chart : 1;
}

/** Credit cost of a report. Flag OFF: 1 (the old Oracle unit). */
export function reportCost(): number {
  return CREDIT_COSTS_ENABLED ? READING_CREDIT_COSTS.report : 1;
}

/** Credit cost of one follow-up question. Flag OFF: 1 (the old Oracle unit). */
export function followUpCost(): number {
  return CREDIT_COSTS_ENABLED ? READING_CREDIT_COSTS.followUp : 1;
}

/**
 * 1 Oracle converts to this many purchased credits (Velu's decided
 * rate, 2026-11-14). The single source of truth for the conversion.
 */
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

export type BillingInterval = "monthly" | "annual";

/** One-time top-up packs. Velu's exact numbers, never change them. */
export interface TopUp {
  id: "topup-1000" | "topup-3000";
  credits: number;
  price: number;
}

export const TOPUPS: TopUp[] = [
  { id: "topup-1000", credits: 1000, price: 9.99 },
  { id: "topup-3000", credits: 3000, price: 24.99 },
];

export function isTopUpId(value: unknown): value is TopUp["id"] {
  return value === "topup-1000" || value === "topup-3000";
}

export function topUpForId(id: TopUp["id"]): TopUp {
  return TOPUPS.find((t) => t.id === id) as TopUp;
}

/**
 * Expected charge in cents for a subscription variant, derived from
 * Velu's exact tier prices (never change them): Spark $7.99/mo /
 * $79.88/yr, Star $14.99/mo / $149.88/yr, Moon $29.99/mo / $299.88/yr.
 * The webhook amount check reads this, so a variant whose price was
 * changed in the dashboard is refused instead of granted.
 */
export function expectedCentsForSubscription(tier: SubscriptionTierId, interval: BillingInterval): number {
  const monthly: Record<SubscriptionTierId, number> = { spark: 799, star: 1499, moon: 2999 };
  const annual: Record<SubscriptionTierId, number> = { spark: 7988, star: 14988, moon: 29988 };
  return interval === "annual" ? annual[tier] : monthly[tier];
}

/** Expected charge in cents for a top-up. Velu's exact numbers. */
export function expectedCentsForTopUp(id: TopUp["id"]): number {
  return id === "topup-1000" ? 999 : 2499;
}
