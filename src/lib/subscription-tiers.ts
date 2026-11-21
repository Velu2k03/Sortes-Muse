/*
 * Phase 2 batch 2: subscription tiers, the server-side source of truth
 * for monthly-grant math. Velu's exact numbers from the Phase 2 plan
 * (remodel-subscription-plan-2026-11-14.md), prices updated by his
 * 2026-11-15 My Choices pick: Spark $9.99 / 1,000 Oracles,
 * Star $19.99 / 2,500, Moon $39.99 / 6,000. Annual is the same monthly
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
 * Oracle conversion for all holders, then verify. The flag shipped
 * OFF until the cutover; flipping it was a deliberate, reviewed change
 * (credit cutover PR, 2026-11-20). Do NOT flip it back without the
 * runbook's rollback section: converted balances stay converted.
 */
export const CREDIT_COSTS_ENABLED = true;

/**
 * The conversion runner's flag check (scripts/convert-oracles.mjs),
 * as a pure function so BOTH flag values are unit-tested on any
 * checkout (convert-oracles-runner.test.ts). The runner passes the
 * checkout's real CREDIT_COSTS_ENABLED; there is no test-only seam in
 * the runner itself. Runbook order is flag-ON first, then convert
 * (converting while OFF would leak), so --live refuses while the flag
 * is OFF, unless the local-test-only override
 * SORTES_CONVERT_ALLOW_FLAG_OFF=1 is set; the override is itself
 * refused on a production-looking URL. Returns the refusal message
 * (the runner exits 2), or null to proceed.
 */
export function conversionFlagRefusal(args: {
  live: boolean;
  flagEnabled: boolean;
  allowFlagOff: boolean;
  looksProduction: boolean;
}): string | null {
  if (!args.live || args.flagEnabled) return null;
  if (args.allowFlagOff && !args.looksProduction) return null;
  return (
    "convert-oracles: CREDIT_COSTS_ENABLED is false in this checkout. Runbook order is flag-ON first, then convert " +
    "(converting first would leak). Run from the flag-ON commit. (Local test databases only: SORTES_CONVERT_ALLOW_FLAG_OFF=1.)"
  );
}

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
 * A credit amount as UI copy: "1 credit", "300 credits", "1,000
 * credits". en-US grouping on purpose (the same fixed locale the
 * pricing page uses), so server and client render the same text.
 */
export function creditsLabel(n: number): string {
  return n === 1 ? "1 credit" : `${n.toLocaleString("en-US")} credits`;
}

/**
 * The amount on a purchase-history row. Rows for the retired Oracle
 * packs (pack_type "pack5 ...", "pack12 ...", "pack30 ...") were
 * bought and recorded in Oracles before the cutover, so they keep
 * that unit; calling a 5-Oracle pack "5 credits" would misstate what
 * the buyer got. Every other row (top-ups, the conversion, test
 * grants) is recorded in credits.
 *
 * PR #175 (Codex P2): fulfillOrder records the GRANTED amount, so a
 * pack fulfilled after the flag flip stores pack-size x 300 (pack5 =
 * 1,500) and is labeled in credits. Legacy pre-flip pack rows store
 * the Oracle count (5/12/30) and keep the Oracle label.
 */
export function purchaseAmountLabel(amount: number, packType: string): string {
  const pack = /^pack(5|12|30)\b/.exec(packType);
  if (pack && amount !== Number(pack[1]) * ORACLE_TO_CREDITS) {
    return amount === 1 ? "1 Oracle" : `${amount} Oracles`;
  }
  return creditsLabel(amount);
}

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
 * Velu's exact tier prices (never change them): Spark $9.99/mo /
 * $103.88/yr, Star $19.99/mo / $209.88/yr, Moon $39.99/mo / $419.88/yr.
 * The webhook amount check reads this, so a variant whose price was
 * changed in the dashboard is refused instead of granted.
 */
export function expectedCentsForSubscription(tier: SubscriptionTierId, interval: BillingInterval): number {
  const monthly: Record<SubscriptionTierId, number> = { spark: 999, star: 1999, moon: 3999 };
  const annual: Record<SubscriptionTierId, number> = { spark: 10388, star: 20988, moon: 41988 };
  return interval === "annual" ? annual[tier] : monthly[tier];
}

/** Expected charge in cents for a top-up. Velu's exact numbers. */
export function expectedCentsForTopUp(id: TopUp["id"]): number {
  return id === "topup-1000" ? 999 : 2499;
}
