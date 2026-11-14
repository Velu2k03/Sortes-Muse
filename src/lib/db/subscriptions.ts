import { usePostgres, pg, sql, ensureSchema, txWithSignal } from "./client";
import { readLocal, writeLocal } from "./json-store";
import { withDbTimeout } from "../db-timeout";
import { prorateRevoke } from "./orders";
import type { DbSubscription } from "./types";

/*
 * Phase 2 batch 3: the subscriptions table (migration 009) and the
 * monthly-balance expiry. The webhook upserts the row on every
 * subscription event; the monthly grant is driven by it
 * (grantMonthlyCredits, idempotent per subscription + period) and
 * the annual drip cron reads the active annual rows.
 *
 * Billing rules, decided in Batch B (see the batch report +
 * docs/CREDIT-CUTOVER-RUNBOOK.md): proration is Lemon Squeezy's
 * default (tier change at next renewal); no new grant while
 * past_due; on expiry the remaining monthly balance is zeroed
 * (purchased credits are never touched); annual is charged up
 * front and dripped monthly, undripped months are never granted.
 */

export interface SubscriptionUpsert {
  userId: string;
  lemonsqueezySubscriptionId: string;
  lemonsqueezyCustomerId?: string | null;
  tier: "spark" | "star" | "moon";
  billingInterval: "monthly" | "annual";
  status: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  renewsAt?: string | null;
  endsAt?: string | null;
  cancelAtPeriodEnd?: boolean;
}

function rowToSubscription(row: {
  id: string;
  user_id: string;
  lemonsqueezy_subscription_id: string;
  lemonsqueezy_customer_id: string | null;
  tier: string;
  billing_interval: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  renews_at: string | null;
  ends_at: string | null;
  cancel_at_period_end: boolean;
  created_at: string | Date;
  updated_at: string | Date;
}): DbSubscription {
  return {
    id: row.id,
    user_id: row.user_id,
    lemonsqueezy_subscription_id: row.lemonsqueezy_subscription_id,
    lemonsqueezy_customer_id: row.lemonsqueezy_customer_id,
    tier: row.tier as DbSubscription["tier"],
    billing_interval: row.billing_interval as DbSubscription["billing_interval"],
    status: row.status,
    current_period_start: row.current_period_start ? new Date(row.current_period_start).toISOString() : null,
    current_period_end: row.current_period_end ? new Date(row.current_period_end).toISOString() : null,
    renews_at: row.renews_at ? new Date(row.renews_at).toISOString() : null,
    ends_at: row.ends_at ? new Date(row.ends_at).toISOString() : null,
    cancel_at_period_end: row.cancel_at_period_end,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

function newSubscriptionId(): string {
  return `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Insert or update a subscription by its Lemon Squeezy id. The
 * webhook calls this on every subscription event, so a redelivered
 * event is a no-op update, never a duplicate row.
 */
export async function upsertSubscription(args: SubscriptionUpsert): Promise<DbSubscription> {
  await ensureSchema();
  if (usePostgres) {
    if (!pg) throw new Error("Database not configured");
    const { rows } = await sql`INSERT INTO subscriptions
      (id, user_id, lemonsqueezy_subscription_id, lemonsqueezy_customer_id, tier, billing_interval, status,
       current_period_start, current_period_end, renews_at, ends_at, cancel_at_period_end, created_at, updated_at)
      VALUES (${newSubscriptionId()}, ${args.userId}, ${args.lemonsqueezySubscriptionId}, ${args.lemonsqueezyCustomerId ?? null},
        ${args.tier}, ${args.billingInterval}, ${args.status},
        ${args.currentPeriodStart ?? null}, ${args.currentPeriodEnd ?? null}, ${args.renewsAt ?? null}, ${args.endsAt ?? null},
        ${args.cancelAtPeriodEnd ?? false}, NOW(), NOW())
      ON CONFLICT (lemonsqueezy_subscription_id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        lemonsqueezy_customer_id = EXCLUDED.lemonsqueezy_customer_id,
        tier = EXCLUDED.tier,
        billing_interval = EXCLUDED.billing_interval,
        status = EXCLUDED.status,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        renews_at = EXCLUDED.renews_at,
        ends_at = EXCLUDED.ends_at,
        cancel_at_period_end = EXCLUDED.cancel_at_period_end,
        updated_at = NOW()
      RETURNING *`;
    return rowToSubscription(rows[0] as never);
  }
  const db = await readLocal();
  const list = db.subscriptions ?? (db.subscriptions = []);
  const now = new Date().toISOString();
  const existing = list.find((s) => s.lemonsqueezy_subscription_id === args.lemonsqueezySubscriptionId);
  if (existing) {
    existing.user_id = args.userId;
    existing.lemonsqueezy_customer_id = args.lemonsqueezyCustomerId ?? null;
    existing.tier = args.tier;
    existing.billing_interval = args.billingInterval;
    existing.status = args.status;
    existing.current_period_start = args.currentPeriodStart ?? null;
    existing.current_period_end = args.currentPeriodEnd ?? null;
    existing.renews_at = args.renewsAt ?? null;
    existing.ends_at = args.endsAt ?? null;
    existing.cancel_at_period_end = args.cancelAtPeriodEnd ?? false;
    existing.updated_at = now;
    await writeLocal(db);
    return existing;
  }
  const row: DbSubscription = {
    id: newSubscriptionId(),
    user_id: args.userId,
    lemonsqueezy_subscription_id: args.lemonsqueezySubscriptionId,
    lemonsqueezy_customer_id: args.lemonsqueezyCustomerId ?? null,
    tier: args.tier,
    billing_interval: args.billingInterval,
    status: args.status,
    current_period_start: args.currentPeriodStart ?? null,
    current_period_end: args.currentPeriodEnd ?? null,
    renews_at: args.renewsAt ?? null,
    ends_at: args.endsAt ?? null,
    cancel_at_period_end: args.cancelAtPeriodEnd ?? false,
    created_at: now,
    updated_at: now,
  };
  list.unshift(row);
  await writeLocal(db);
  return row;
}

export async function getSubscriptionByProviderId(
  lemonsqueezySubscriptionId: string
): Promise<DbSubscription | null> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`SELECT * FROM subscriptions WHERE lemonsqueezy_subscription_id = ${lemonsqueezySubscriptionId} LIMIT 1`;
    if (rows.length === 0) return null;
    return rowToSubscription(rows[0] as never);
  }
  const db = await readLocal();
  return (db.subscriptions ?? []).find((s) => s.lemonsqueezy_subscription_id === lemonsqueezySubscriptionId) ?? null;
}

/**
 * The user's current subscription, if any: the most recent row
 * whose status is not expired. A cancelled (grace-period) row
 * still counts — access runs until ends_at.
 */
export async function getActiveSubscriptionForUser(userId: string): Promise<DbSubscription | null> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`SELECT * FROM subscriptions
      WHERE user_id = ${userId} AND status <> 'expired'
      ORDER BY created_at DESC LIMIT 1`;
    if (rows.length === 0) return null;
    return rowToSubscription(rows[0] as never);
  }
  const db = await readLocal();
  return (
    (db.subscriptions ?? [])
      .filter((s) => s.user_id === userId && s.status !== "expired")
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] ?? null
  );
}

/**
 * Active annual subscriptions, for the monthly drip cron. A
 * cancelled (grace-period) annual row is included — the year was
 * paid for, so the drip runs until the period ends. Expired rows
 * are excluded.
 */
export async function listActiveAnnualSubscriptions(limit = 500): Promise<DbSubscription[]> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`SELECT * FROM subscriptions
      WHERE billing_interval = 'annual' AND status IN ('active', 'on_trial', 'cancelled', 'past_due')
      ORDER BY created_at ASC LIMIT ${limit}`;
    return (rows as Array<Record<string, unknown>>).map((r) => rowToSubscription(r as never));
  }
  const db = await readLocal();
  return (db.subscriptions ?? [])
    .filter((s) => s.billing_interval === "annual" && ["active", "on_trial", "cancelled", "past_due"].includes(s.status))
    .slice(0, limit);
}

/**
 * Zero a user's remaining monthly balance when their subscription
 * expires. Purchased credits are never touched. Writes an audit
 * row (kind 'expiry', amount = the monthly balance removed) so the
 * zeroing is traceable in credit_grants. Returns the amount
 * removed (0 when there was nothing to remove).
 */
export async function expireMonthlyBalance(userId: string, subscriptionId: string): Promise<number> {
  await ensureSchema();
  if (usePostgres) {
    if (!pg) throw new Error("Database not configured");
    const controller = new AbortController();
    const begin = pg.begin(async (rawTx) => {
      const tx = txWithSignal(rawTx, controller.signal);
      const locked = (await tx`SELECT monthly_credits FROM users WHERE id = ${userId} FOR UPDATE`) as Array<{
        monthly_credits: number;
      }>;
      if (locked.length === 0) throw new Error("User not found during monthly expiry");
      // The monthly pool is shared across a user's subscriptions.
      // If another subscription is still live (e.g. the user
      // re-subscribed during this one's grace period), the pool
      // now belongs to it — zeroing here would take credits the
      // other subscription granted.
      const other = (await tx`SELECT 1 FROM subscriptions
        WHERE user_id = ${userId}
          AND lemonsqueezy_subscription_id <> ${subscriptionId}
          AND status <> 'expired'
          AND (ends_at IS NULL OR ends_at > NOW())
        LIMIT 1`) as Array<{ "?column?": number }>;
      if (other.length > 0) return 0;
      const removed = locked[0].monthly_credits;
      if (removed <= 0) return 0;
      await tx`UPDATE users SET monthly_credits = 0 WHERE id = ${userId}`;
      await tx`INSERT INTO credit_grants
        (id, user_id, kind, amount, subscription_id, period_key, tier, expires_at, granted_at)
        VALUES (${`g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`}, ${userId}, 'expiry', ${removed}, ${subscriptionId}, NULL, NULL, NULL, NOW())`;
      return removed;
    });
    return await withDbTimeout(begin, controller);
  }
  const db = await readLocal();
  const u = db.users.find((x) => x.id === userId);
  if (!u) throw new Error("User not found during monthly expiry");
  // Another live subscription owns the pool now (see the Postgres
  // branch above); do not zero credits it granted.
  const now = new Date();
  const otherLive = (db.subscriptions ?? []).some(
    (s) =>
      s.user_id === userId &&
      s.lemonsqueezy_subscription_id !== subscriptionId &&
      s.status !== "expired" &&
      (!s.ends_at || new Date(s.ends_at) > now)
  );
  if (otherLive) return 0;
  const removed = u.monthly_credits ?? 0;
  if (removed <= 0) return 0;
  u.monthly_credits = 0;
  u.credits = (u.monthly_credits ?? 0) + (u.purchased_credits ?? 0);
  const grants = db.creditGrants ?? (db.creditGrants = []);
  grants.unshift({
    id: `g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    user_id: userId,
    kind: "expiry",
    amount: removed,
    subscription_id: subscriptionId,
    period_key: null,
    tier: null,
    expires_at: null,
    granted_at: new Date().toISOString(),
  });
  await writeLocal(db);
  return removed;
}

/**
 * Revoke one period's monthly grant after a subscription payment
 * refund. The grant row for (subscription, period) is the source
 * of truth for what was granted; the revoke is prorated by the
 * invoice's refunded amount (like prorateRevoke for packs) and
 * taken from monthly first, remainder from purchased, clamped at
 * 0 — the same total-clamp as the pack revoke. Returns the amount
 * revoked (0 when nothing was granted for that period, or it was
 * already revoked). Idempotent: a second call for the same period
 * finds the grant already consumed and revokes 0.
 */
export async function revokeSubscriptionGrant(args: {
  userId: string;
  subscriptionId: string;
  periodKey: string;
  /** Invoice total in cents (the period's charge). */
  totalCents: number;
  /** Cumulative refunded amount in cents; undefined/0 = full refund. */
  refundedCents?: number;
}): Promise<{ revoked: boolean; amount: number }> {
  await ensureSchema();
  if (usePostgres) {
    if (!pg) throw new Error("Database not configured");
    const controller = new AbortController();
    const begin = pg.begin(async (rawTx) => {
      const tx = txWithSignal(rawTx, controller.signal);
      const locked = (await tx`SELECT monthly_credits, purchased_credits FROM users WHERE id = ${args.userId} FOR UPDATE`) as Array<{
        monthly_credits: number;
        purchased_credits: number;
      }>;
      if (locked.length === 0) throw new Error("User not found during subscription refund");
      const grant = (await tx`SELECT amount FROM credit_grants
        WHERE subscription_id = ${args.subscriptionId} AND period_key = ${args.periodKey} AND kind = 'monthly' LIMIT 1`) as Array<{
        amount: number;
      }>;
      if (grant.length === 0) return { revoked: false, amount: 0 };
      const granted = grant[0].amount;
      // Already-revoked for this period: expiry rows are the only
      // negative monthly adjustments tracked per period; sum them.
      const already = (await tx`SELECT COALESCE(SUM(amount), 0)::int AS done FROM credit_grants
        WHERE subscription_id = ${args.subscriptionId} AND period_key = ${args.periodKey} AND kind = 'expiry'`) as Array<{
        done: number;
      }>;
      const delta = prorateRevoke(granted, args.totalCents / 100, args.refundedCents, already[0].done);
      if (delta <= 0) return { revoked: false, amount: 0 };
      // A monthly grant is revoked from the monthly pool only, never
      // from purchased: the grant was monthly credits, and if the
      // monthly balance is already gone (e.g. the subscription
      // expired and expireMonthlyBalance zeroed it), there is nothing
      // left to take back — spilling into purchased would take
      // credits the buyer paid for separately.
      const actual = Math.min(delta, locked[0].monthly_credits);
      if (actual <= 0) return { revoked: false, amount: 0 };
      await tx`UPDATE users
        SET monthly_credits = monthly_credits - ${actual}
        WHERE id = ${args.userId}`;
      await tx`INSERT INTO credit_grants
        (id, user_id, kind, amount, subscription_id, period_key, tier, expires_at, granted_at)
        VALUES (${`g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`}, ${args.userId}, 'expiry', ${actual}, ${args.subscriptionId}, ${args.periodKey}, NULL, NULL, NOW())`;
      return { revoked: true, amount: actual };
    });
    return await withDbTimeout(begin, controller);
  }
  const db = await readLocal();
  const u = db.users.find((x) => x.id === args.userId);
  if (!u) throw new Error("User not found during subscription refund");
  const grants = db.creditGrants ?? (db.creditGrants = []);
  const grant = grants.find(
    (g) => g.subscription_id === args.subscriptionId && g.period_key === args.periodKey && g.kind === "monthly"
  );
  if (!grant) return { revoked: false, amount: 0 };
  const already = grants
    .filter((g) => g.subscription_id === args.subscriptionId && g.period_key === args.periodKey && g.kind === "expiry")
    .reduce((n, g) => n + g.amount, 0);
  const delta = prorateRevoke(grant.amount, args.totalCents / 100, args.refundedCents, already);
  if (delta <= 0) return { revoked: false, amount: 0 };
  // A monthly grant is revoked from the monthly pool only, never
  // from purchased (see the Postgres branch).
  const actual = Math.min(delta, u.monthly_credits ?? 0);
  if (actual <= 0) return { revoked: false, amount: 0 };
  u.monthly_credits = (u.monthly_credits ?? 0) - actual;
  u.credits = (u.monthly_credits ?? 0) + (u.purchased_credits ?? 0);
  grants.unshift({
    id: `g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    user_id: args.userId,
    kind: "expiry",
    amount: actual,
    subscription_id: args.subscriptionId,
    period_key: args.periodKey,
    tier: null,
    expires_at: null,
    granted_at: new Date().toISOString(),
  });
  await writeLocal(db);
  return { revoked: true, amount: actual };
}
