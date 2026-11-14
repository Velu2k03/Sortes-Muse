import type postgres from "postgres";
import { usePostgres, pg, sql, ensureSchema, txWithSignal } from "./client";
import { readLocal, writeLocal } from "./json-store";
import { withDbTimeout } from "../db-timeout";
import {
  SUBSCRIPTION_TIERS,
  grantableMonthly,
  isSubscriptionTierId,
  oracleToCredits,
  type SubscriptionTierId,
} from "../subscription-tiers";
import type { CreditGrant, DbUser } from "./types";

/*
 * Phase 2 batch 2: the two-ledger credit system.
 *
 * DESIGN (why two balance columns + a grants table, not a pure
 * per-grant ledger): the verification recommended a credit_grants
 * ledger as the safer fit for capped rollover and the Oracle
 * conversion line. A pure ledger (spend deducts across many grant
 * rows, oldest first) would have rewritten every spend site — the
 * reading/report/follow-up transactions that the money-path suite
 * proves atomic — into multi-row deduction loops inside those
 * transactions. The hybrid here keeps the proven shape: balances
 * are two columns on users (monthly_credits, purchased_credits)
 * with users.credits as their generated total, so every spend stays
 * ONE atomic UPDATE with the same conditional-guard pattern, and
 * credit_grants is the audit/idempotency ledger on top of it (one
 * row per monthly grant, unique per subscription + period; one row
 * per Oracle conversion, unique per user). Rollover is enforced at
 * grant time (monthly balance capped at two months of the plan), not
 * by expiring rows — a monthly balance is never silently deleted.
 *
 * Spend order everywhere: monthly first, then purchased.
 * Purchased credits never expire. Monthly grants are idempotent per
 * (subscription, period). Annual subscriptions drip monthly: the
 * grant function takes a period key, never a year.
 *
 * Units: until the credit-cost switch lands in a later batch, a
 * reading still costs 1 (the old Oracle unit). Monthly grants are
 * already denominated in the new credit unit (1,000 / 2,500 /
 * 6,000), and the conversion is 1 Oracle = 300 credits — but no
 * grant or conversion runs against live data in this batch (no
 * subscription exists, no webhook wiring, migration 008 is not
 * applied to production), so live balances are untouched.
 */

export interface CreditBalances {
  monthly: number;
  purchased: number;
  total: number;
}

export interface MonthlyGrantResult {
  /** True when this call claimed the period (first time). False on a retried period. */
  granted: boolean;
  /** Credits actually added (0 when the monthly balance was already at the cap). */
  amount: number;
  balances: CreditBalances;
}

export interface OracleConversionResult {
  /** True when this call performed the conversion. False when it was already converted. */
  converted: boolean;
  alreadyConverted: boolean;
  /** True when the post-flag guard refused the conversion (no balance changed). */
  refused?: boolean;
  /** Why the guard refused, when refused is true. */
  refuseReason?: string;
  /** Oracle balance converted (0 when already converted and the earlier grant is re-read). */
  oracles: number;
  credits: number;
  balances: CreditBalances;
}

function newGrantId(): string {
  return `g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function newTransactionId(): string {
  return `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function toBalances(row: { monthly_credits: number; purchased_credits: number; credits: number }): CreditBalances {
  return { monthly: row.monthly_credits, purchased: row.purchased_credits, total: row.credits };
}

/**
 * Pure spend arithmetic, shared by the SQL below and the local-JSON
 * branch: take from monthly first, spill into purchased. Returns the
 * new balances, or null when the total is insufficient (nothing spent).
 */
export function spendFromBalances(
  balances: CreditBalances,
  n: number
): CreditBalances | null {
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("spendFromBalances: n must be a positive number.");
  }
  if (balances.total < n) return null;
  const fromMonthly = Math.min(balances.monthly, n);
  const monthly = balances.monthly - fromMonthly;
  const purchased = balances.purchased - (n - fromMonthly);
  return { monthly, purchased, total: monthly + purchased };
}

/**
 * Local-JSON helper: keep the stored total in sync (Postgres does
 * this via the generated column). A legacy row with NEITHER ledger
 * key holds its whole balance as purchased — Oracles never expired,
 * and purchased credits never expire — so the first sync moves the
 * total into purchased instead of zeroing it.
 */
export function syncLedgerTotal(user: DbUser): void {
  if (user.monthly_credits === undefined && user.purchased_credits === undefined) {
    user.purchased_credits = user.credits;
    user.monthly_credits = 0;
  }
  user.monthly_credits = user.monthly_credits ?? 0;
  user.purchased_credits = user.purchased_credits ?? 0;
  user.credits = user.monthly_credits + user.purchased_credits;
}

/** Local-JSON helper: spend monthly-first against an in-memory user row. False when insufficient. */
export function applySpendToUser(user: DbUser | undefined, n: number): boolean {
  if (!user) return false;
  syncLedgerTotal(user);
  const next = spendFromBalances(
    { monthly: user.monthly_credits ?? 0, purchased: user.purchased_credits ?? 0, total: user.credits },
    n
  );
  if (!next) return false;
  user.monthly_credits = next.monthly;
  user.purchased_credits = next.purchased;
  user.credits = next.total;
  return true;
}

/** Local-JSON helper: grant into one ledger and re-sync the total. */
export function applyGrantToUser(user: DbUser, kind: "monthly" | "purchased", n: number): void {
  syncLedgerTotal(user);
  if (kind === "monthly") user.monthly_credits = (user.monthly_credits ?? 0) + n;
  else user.purchased_credits = (user.purchased_credits ?? 0) + n;
  user.credits = (user.monthly_credits ?? 0) + (user.purchased_credits ?? 0);
}

/**
 * Local-JSON helper: take back a refunded pack grant — purchased
 * first (packs always grant purchased), remainder from monthly,
 * clamped at 0, mirroring the Postgres revoke below.
 */
export function applyRevokeToUser(user: DbUser, delta: number): void {
  syncLedgerTotal(user);
  const fromPurchased = Math.min(user.purchased_credits ?? 0, delta);
  user.purchased_credits = Math.max(0, (user.purchased_credits ?? 0) - fromPurchased);
  user.monthly_credits = Math.max(0, (user.monthly_credits ?? 0) - (delta - fromPurchased));
  user.credits = (user.monthly_credits ?? 0) + (user.purchased_credits ?? 0);
}

/**
 * Spend n from the ledgers inside an already-open transaction (or a
 * standalone query): one atomic UPDATE, monthly first, conditional
 * on the total being sufficient. `query` is the postgres.js tag
 * (module `pg`, or the `tx` inside a pg.begin callback — both are
 * ISql). Returns the new balances, or null when insufficient
 * (nothing was spent). Callers inside a transaction must treat null
 * as "do not write the reading/report row".
 */
export async function spendFromLedgers(
  query: postgres.ISql,
  userId: string,
  n: number
): Promise<CreditBalances | null> {
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("spendFromLedgers: n must be a positive number.");
  }
  // All SET expressions read the OLD row values, so LEAST(...) is
  // evaluated against the pre-spend monthly balance in both places.
  const rows = (await query`UPDATE users
    SET monthly_credits = monthly_credits - LEAST(monthly_credits, ${n}),
        purchased_credits = purchased_credits - (${n} - LEAST(monthly_credits, ${n}))
    WHERE id = ${userId} AND monthly_credits + purchased_credits >= ${n}
    RETURNING monthly_credits, purchased_credits, credits`) as Array<{
    monthly_credits: number;
    purchased_credits: number;
    credits: number;
  }>;
  if (rows.length === 0) return null;
  return toBalances(rows[0]);
}

export async function getCreditBalances(userId: string): Promise<CreditBalances | null> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`SELECT monthly_credits, purchased_credits, credits FROM users WHERE id = ${userId} LIMIT 1`;
    if (rows.length === 0) return null;
    return toBalances(rows[0] as { monthly_credits: number; purchased_credits: number; credits: number });
  }
  const db = await readLocal();
  const u = db.users.find((x) => x.id === userId);
  if (!u) return null;
  syncLedgerTotal(u);
  return {
    monthly: u.monthly_credits ?? 0,
    purchased: u.purchased_credits ?? 0,
    total: u.credits,
  };
}

export async function listCreditGrants(userId: string): Promise<CreditGrant[]> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`SELECT * FROM credit_grants WHERE user_id = ${userId} ORDER BY granted_at DESC LIMIT 50`;
    return rows as CreditGrant[];
  }
  const db = await readLocal();
  return (db.creditGrants ?? [])
    .filter((g) => g.user_id === userId)
    .slice(0, 50);
}

export interface GrantMonthlyArgs {
  userId: string;
  /** Lemon Squeezy subscription id (stable across renewals). */
  subscriptionId: string;
  tier: SubscriptionTierId;
  /**
   * The billing period being granted, e.g. "2026-11" (monthly) or the
   * annual drip month. The grant is idempotent per (subscription,
   * period): a retry with the same key grants nothing more. Annual
   * subscriptions call this once per month with that month's key —
   * never once per year.
   */
  periodKey: string;
  /** Period end, recorded on the grant row for audit only (never enforced by spend). */
  periodEnd?: string | null;
}

/** Postgres branch: lock the user, claim the period, grant up to the cap. One transaction. */
async function grantMonthlyPostgres(args: GrantMonthlyArgs): Promise<MonthlyGrantResult> {
  if (!pg) throw new Error("Database not configured");
  const tier = SUBSCRIPTION_TIERS[args.tier];
  const controller = new AbortController();
  const begin = pg.begin(async (rawTx) => {
    const tx = txWithSignal(rawTx, controller.signal);
    const locked = (await tx`SELECT monthly_credits, purchased_credits, credits FROM users WHERE id = ${args.userId} FOR UPDATE`) as Array<{
      monthly_credits: number;
      purchased_credits: number;
      credits: number;
    }>;
    if (locked.length === 0) throw new Error("User not found during monthly grant");
    const current = toBalances(locked[0]);
    const amount = grantableMonthly(current.monthly, tier);
    const grant: CreditGrant = {
      id: newGrantId(),
      user_id: args.userId,
      kind: "monthly",
      amount,
      subscription_id: args.subscriptionId,
      period_key: args.periodKey,
      tier: args.tier,
      expires_at: args.periodEnd ?? null,
      granted_at: new Date().toISOString(),
    };
    // Claim the period first: the partial unique index
    // (subscription_id, period_key) WHERE kind = 'monthly' makes
    // a concurrent or retried grant for the same period insert
    // zero rows, so it can never double-grant even if the balance
    // check is raced. The ON CONFLICT predicate must match the
    // index predicate (migration 010 scopes it to monthly).
    const claimed = (await tx`INSERT INTO credit_grants
      (id, user_id, kind, amount, subscription_id, period_key, tier, expires_at, granted_at)
      VALUES (${grant.id}, ${grant.user_id}, ${grant.kind}, ${grant.amount}, ${grant.subscription_id}, ${grant.period_key}, ${grant.tier}, ${grant.expires_at}, NOW())
      ON CONFLICT (subscription_id, period_key) WHERE subscription_id IS NOT NULL AND period_key IS NOT NULL AND kind = 'monthly' DO NOTHING
      RETURNING id`) as Array<{ id: string }>;
    if (claimed.length === 0) {
      return { granted: false, amount: 0, balances: current };
    }
    const upd = (await tx`UPDATE users SET monthly_credits = monthly_credits + ${amount}
      WHERE id = ${args.userId}
      RETURNING monthly_credits, purchased_credits, credits`) as Array<{
      monthly_credits: number;
      purchased_credits: number;
      credits: number;
    }>;
    return { granted: true, amount, balances: toBalances(upd[0]) };
  });
  return await withDbTimeout(begin, controller);
}

/** Local-file branch of grantMonthlyCredits (dev only). */
async function grantMonthlyLocal(args: GrantMonthlyArgs): Promise<MonthlyGrantResult> {
  const tier = SUBSCRIPTION_TIERS[args.tier];
  const db = await readLocal();
  const u = db.users.find((x) => x.id === args.userId);
  if (!u) throw new Error("User not found during monthly grant");
  syncLedgerTotal(u);
  const current: CreditBalances = {
    monthly: u.monthly_credits ?? 0,
    purchased: u.purchased_credits ?? 0,
    total: u.credits,
  };
  const grants = db.creditGrants ?? (db.creditGrants = []);
  if (
    grants.some(
      (g) => g.kind === "monthly" && g.subscription_id === args.subscriptionId && g.period_key === args.periodKey
    )
  ) {
    return { granted: false, amount: 0, balances: current };
  }
  const amount = grantableMonthly(current.monthly, tier);
  grants.unshift({
    id: newGrantId(),
    user_id: args.userId,
    kind: "monthly",
    amount,
    subscription_id: args.subscriptionId,
    period_key: args.periodKey,
    tier: args.tier,
    expires_at: args.periodEnd ?? null,
    granted_at: new Date().toISOString(),
  });
  applyGrantToUser(u, "monthly", amount);
  await writeLocal(db);
  return {
    granted: true,
    amount,
    balances: { monthly: u.monthly_credits ?? 0, purchased: u.purchased_credits ?? 0, total: u.credits },
  };
}

/**
 * Grant one month of subscription credits, idempotently per
 * (subscription, period). The monthly balance is capped at two
 * months of the plan; a grant at the cap adds 0 but still consumes
 * the period. Annual subscriptions drip: call once per month with
 * that month's period key, never once for the whole year.
 */
export async function grantMonthlyCredits(args: GrantMonthlyArgs): Promise<MonthlyGrantResult> {
  if (!args.subscriptionId || !args.periodKey) {
    throw new Error("grantMonthlyCredits: subscriptionId and periodKey are required.");
  }
  if (!isSubscriptionTierId(args.tier)) {
    throw new Error(`grantMonthlyCredits: unknown tier ${String(args.tier)}.`);
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.periodKey)) {
    throw new Error(`grantMonthlyCredits: periodKey must be YYYY-MM, got ${args.periodKey}.`);
  }
  await ensureSchema();
  if (usePostgres) return grantMonthlyPostgres(args);
  return grantMonthlyLocal(args);
}

/** Postgres branch: lock the user, convert once, record the conversion line. One transaction. */
async function convertOraclesPostgres(
  userId: string,
  opts?: { flagFlippedAt?: string }
): Promise<OracleConversionResult> {
  if (!pg) throw new Error("Database not configured");
  const controller = new AbortController();
  const begin = pg.begin(async (rawTx) => {
    const tx = txWithSignal(rawTx, controller.signal);
    const locked = (await tx`SELECT email, monthly_credits, purchased_credits, credits FROM users WHERE id = ${userId} FOR UPDATE`) as Array<{
      email: string;
      monthly_credits: number;
      purchased_credits: number;
      credits: number;
    }>;
    if (locked.length === 0) throw new Error("User not found during Oracle conversion");
    const current = toBalances(locked[0]);
    const prior = (await tx`SELECT amount FROM credit_grants WHERE user_id = ${userId} AND kind = 'conversion' LIMIT 1`) as Array<{
      amount: number;
    }>;
    if (prior.length > 0) {
      return {
        converted: false,
        alreadyConverted: true,
        oracles: prior[0].amount / 300,
        credits: prior[0].amount,
        balances: current,
      };
    }
    // Post-flag guard (Batch B miss-check item 3): refuse users
    // who already hold credit-denominated grants. A 'monthly'
    // grant can only exist after the flag flipped (subscriptions
    // are only purchasable with the flag ON), so any monthly grant
    // proves post-flag activity. A pack/top-up bought after the
    // flip is already credits, not Oracles — and packs/top-ups
    // record in `transactions`, not in credit_grants (no code
    // writes a 'purchased' grant row), so the purchase check
    // reads transactions.created_at against the flip time. The
    // runner MUST pass flagFlippedAt (the deploy time of the
    // flag-ON commit); without it only the monthly-grant check runs.
    const monthly = (await tx`SELECT 1 FROM credit_grants
      WHERE user_id = ${userId} AND kind = 'monthly' LIMIT 1`) as Array<{ "?column?": number }>;
    if (monthly.length > 0) {
      return {
        converted: false,
        alreadyConverted: false,
        refused: true,
        refuseReason: "user has a monthly (subscription) grant — post-flag, do not convert",
        oracles: 0,
        credits: 0,
        balances: current,
      };
    }
    if (opts?.flagFlippedAt) {
      const postFlag = (await tx`SELECT 1 FROM transactions
        WHERE user_id = ${userId} AND pack_type <> 'oracle-conversion' AND created_at >= ${opts.flagFlippedAt} LIMIT 1`) as Array<{
        "?column?": number;
      }>;
      if (postFlag.length > 0) {
        return {
          converted: false,
          alreadyConverted: false,
          refused: true,
          refuseReason: "user has a purchase after the flag flip — already credits, do not convert",
          oracles: 0,
          credits: 0,
          balances: current,
        };
      }
    }
    // Precondition (launch order): no subscription grant has run
    // yet, so the whole balance sits in purchased — the backfilled
    // Oracle balance. Converting purchased only is what keeps a
    // monthly balance, if one ever existed, out of the conversion.
    const oracles = locked[0].purchased_credits;
    const credits = oracleToCredits(oracles);
    await tx`UPDATE users SET purchased_credits = ${credits} WHERE id = ${userId}`;
    await tx`INSERT INTO credit_grants
      (id, user_id, kind, amount, subscription_id, period_key, tier, expires_at, granted_at)
      VALUES (${newGrantId()}, ${userId}, 'conversion', ${credits}, NULL, 'oracle-conversion', NULL, NULL, NOW())`;
    // The conversion line in the account: a transactions row, so it
    // shows in purchase history (listTransactions) next to pack
    // purchases. A zero balance converts to 0 and gets the grant row
    // (marked converted) but no history noise.
    if (credits > 0) {
      await tx`INSERT INTO transactions (id, user_id, email, pack_type, amount, readings, created_at)
        VALUES (${newTransactionId()}, ${userId}, ${locked[0].email}, 'oracle-conversion', 0, ${credits}, NOW())`;
    }
    const after = (await tx`SELECT monthly_credits, purchased_credits, credits FROM users WHERE id = ${userId}`) as Array<{
      monthly_credits: number;
      purchased_credits: number;
      credits: number;
    }>;
    return {
      converted: true,
      alreadyConverted: false,
      oracles,
      credits,
      balances: toBalances(after[0]),
    };
  });
  return await withDbTimeout(begin, controller);
}

/** Local-file branch of convertOraclesToCredits (dev only). */
async function convertOraclesLocal(
  userId: string,
  opts?: { flagFlippedAt?: string }
): Promise<OracleConversionResult> {
  const db = await readLocal();
  const u = db.users.find((x) => x.id === userId);
  if (!u) throw new Error("User not found during Oracle conversion");
  syncLedgerTotal(u);
  const current: CreditBalances = {
    monthly: u.monthly_credits ?? 0,
    purchased: u.purchased_credits ?? 0,
    total: u.credits,
  };
  const grants = db.creditGrants ?? (db.creditGrants = []);
  const prior = grants.find((g) => g.user_id === userId && g.kind === "conversion");
  if (prior) {
    return {
      converted: false,
      alreadyConverted: true,
      oracles: prior.amount / 300,
      credits: prior.amount,
      balances: current,
    };
  }
  // Post-flag guard (same as the Postgres branch): refuse users
  // with a monthly grant, or a purchase after the flag flip
  // (transactions, not credit_grants — packs/top-ups record there).
  if (grants.some((g) => g.user_id === userId && g.kind === "monthly")) {
    return {
      converted: false,
      alreadyConverted: false,
      refused: true,
      refuseReason: "user has a monthly (subscription) grant — post-flag, do not convert",
      oracles: 0,
      credits: 0,
      balances: current,
    };
  }
  if (opts?.flagFlippedAt) {
    const txs = db.transactions ?? [];
    const flipMs = new Date(opts.flagFlippedAt as string).getTime();
    if (
      txs.some(
        (t) =>
          t.user_id === userId &&
          t.pack_type !== "oracle-conversion" &&
          t.created_at &&
          new Date(t.created_at).getTime() >= flipMs
      )
    ) {
      return {
        converted: false,
        alreadyConverted: false,
        refused: true,
        refuseReason: "user has a purchase after the flag flip — already credits, do not convert",
        oracles: 0,
        credits: 0,
        balances: current,
      };
    }
  }
  const oracles = u.purchased_credits ?? 0;
  const credits = oracleToCredits(oracles);
  u.purchased_credits = credits;
  syncLedgerTotal(u);
  grants.unshift({
    id: newGrantId(),
    user_id: userId,
    kind: "conversion",
    amount: credits,
    subscription_id: null,
    period_key: "oracle-conversion",
    tier: null,
    expires_at: null,
    granted_at: new Date().toISOString(),
  });
  if (credits > 0) {
    db.transactions.unshift({
      id: newTransactionId(),
      user_id: userId,
      email: u.email,
      pack_type: "oracle-conversion",
      amount: 0,
      readings: credits,
      created_at: new Date().toISOString(),
    });
  }
  await writeLocal(db);
  return {
    converted: true,
    alreadyConverted: false,
    oracles,
    credits,
    balances: { monthly: u.monthly_credits ?? 0, purchased: u.purchased_credits ?? 0, total: u.credits },
  };
}

/**
 * Convert a user's existing Oracle balance to purchased credits at
 * 1 Oracle = 300 credits. The converted balance is purchased, so it
 * never expires, and the conversion is shown as a line in the
 * account (credit_grants row + transactions row).
 *
 * DO NOT CALL OUTSIDE THE CONVERSION RUNNER. The runner (not built
 * yet) owns the cutover order in docs/CREDIT-CUTOVER-RUNBOOK.md:
 * flag-ON first (CREDIT_COSTS_ENABLED), THEN run this once per
 * holder, inside a freeze window — never the reverse. Converting
 * before the flag flips would leak (a 300-credit Oracle would buy
 * 300 readings at 1 credit each). The runner MUST pass
 * flagFlippedAt (the flag-ON deploy time) so the post-flag guard
 * can refuse users who bought a pack/top-up or a subscription
 * after the flip; those balances are already credits and must
 * never be multiplied by 300. A second run for the same user is
 * a no-op (alreadyConverted, balance unchanged).
 */
export async function convertOraclesToCredits(
  userId: string,
  opts?: { flagFlippedAt?: string }
): Promise<OracleConversionResult> {
  await ensureSchema();
  if (usePostgres) return convertOraclesPostgres(userId, opts);
  return convertOraclesLocal(userId, opts);
}
