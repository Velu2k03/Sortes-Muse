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
  refunded_at: string | Date | null;
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
    refunded_at: row.refunded_at ? new Date(row.refunded_at).toISOString() : null,
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
 * event is a no-op update, never a duplicate row. A null
 * currentPeriodStart means "keep the existing cycle start": only
 * an invoice (payment_success) supplies a new one, so a
 * subscription_updated on renewal cannot reset the annual cycle
 * to the original creation date. The cycle start never moves
 * backward: a late year-1 payment_success is clamped to the
 * existing start with GREATEST, so the drip cron cannot re-grant
 * year-1 months. The user_id is set on insert only and never
 * reassigned on conflict: events are signed and verified, but a
 * subscription must not be movable to another user.
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
        lemonsqueezy_customer_id = EXCLUDED.lemonsqueezy_customer_id,
        tier = EXCLUDED.tier,
        billing_interval = EXCLUDED.billing_interval,
        status = EXCLUDED.status,
        current_period_start = CASE
          WHEN EXCLUDED.current_period_start IS NULL THEN subscriptions.current_period_start
          WHEN subscriptions.current_period_start IS NULL THEN EXCLUDED.current_period_start
          ELSE GREATEST(EXCLUDED.current_period_start, subscriptions.current_period_start)
        END,
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
    // user_id is set on insert only, never reassigned (see the
    // Postgres branch). refunded_at is never cleared here: a
    // later event must not resume the drip for a refunded cycle.
    existing.lemonsqueezy_customer_id = args.lemonsqueezyCustomerId ?? null;
    existing.tier = args.tier;
    existing.billing_interval = args.billingInterval;
    existing.status = args.status;
    // Never move the cycle start backward (GREATEST, same as the
    // Postgres branch): a null new start keeps the existing one.
    if (args.currentPeriodStart) {
      const incoming = new Date(args.currentPeriodStart).getTime();
      const current = existing.current_period_start ? new Date(existing.current_period_start).getTime() : NaN;
      if (Number.isNaN(current) || incoming > current) {
        existing.current_period_start = args.currentPeriodStart;
      }
    }
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
    refunded_at: null,
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
 * paid for, so the drip runs until the period ends — UNLESS the
 * user has since started a newer live annual plan, in which case
 * the new plan's drip covers them and the old row stops dripping
 * (otherwise both would grant into the same monthly pool).
 * Refunded rows are excluded: a full refund stops the drip
 * (revokeAllSubscriptionGrants sets refunded_at). Expired rows
 * are excluded. Paged by (limit, offset) so the drip cron can
 * walk more than 500 subscriptions.
 */
export async function listActiveAnnualSubscriptions(limit = 500, offset = 0): Promise<DbSubscription[]> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`SELECT * FROM subscriptions
      WHERE billing_interval = 'annual' AND status IN ('active', 'on_trial', 'cancelled', 'past_due')
        AND refunded_at IS NULL
        AND NOT (
          status = 'cancelled'
          AND EXISTS (
            SELECT 1 FROM subscriptions s2
            WHERE s2.user_id = subscriptions.user_id
              AND s2.billing_interval = 'annual'
              AND s2.status IN ('active', 'on_trial', 'past_due')
              AND s2.refunded_at IS NULL
              AND s2.created_at > subscriptions.created_at
          )
        )
      ORDER BY created_at ASC, id ASC LIMIT ${limit} OFFSET ${offset}`;
    return (rows as Array<Record<string, unknown>>).map((r) => rowToSubscription(r as never));
  }
  const db = await readLocal();
  const all = (db.subscriptions ?? [])
    .filter((s) => s.billing_interval === "annual" && ["active", "on_trial", "cancelled", "past_due"].includes(s.status))
    .filter((s) => !s.refunded_at)
    .filter(
      (s) =>
        s.status !== "cancelled" ||
        !(db.subscriptions ?? []).some(
          (o) =>
            o.user_id === s.user_id &&
            o.billing_interval === "annual" &&
            ["active", "on_trial", "past_due"].includes(o.status) &&
            !o.refunded_at &&
            new Date(o.created_at).getTime() > new Date(s.created_at).getTime()
        )
    )
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return all.slice(offset, offset + limit);
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
      // Already-revoked for this period: refund revokes are
      // audited as kind 'refund' (migration 010); pre-010 revokes
      // wrote 'expiry' for the same purpose, so sum both kinds
      // for backward compatibility.
      const already = (await tx`SELECT COALESCE(SUM(amount), 0)::int AS done FROM credit_grants
        WHERE subscription_id = ${args.subscriptionId} AND period_key = ${args.periodKey} AND kind IN ('expiry', 'refund')`) as Array<{
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
        VALUES (${`g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`}, ${args.userId}, 'refund', ${actual}, ${args.subscriptionId}, ${args.periodKey}, NULL, NULL, NOW())`;
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
    .filter((g) => g.subscription_id === args.subscriptionId && g.period_key === args.periodKey && ["expiry", "refund"].includes(g.kind))
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
    kind: "refund",
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

/**
 * The period keys (YYYY-MM) that already have a 'monthly' grant
 * for a subscription. The drip cron uses this to skip months it
 * already granted (one query instead of one transaction per
 * month), and revokeAllSubscriptionGrants uses it to find every
 * month a refund must revoke.
 */
export async function listGrantedSubscriptionPeriods(subscriptionId: string): Promise<string[]> {
  await ensureSchema();
  if (usePostgres) {
    const { rows } = await sql`SELECT DISTINCT period_key FROM credit_grants
      WHERE subscription_id = ${subscriptionId} AND kind = 'monthly' AND period_key IS NOT NULL
      ORDER BY period_key`;
    return (rows as Array<{ period_key: string }>).map((r) => r.period_key);
  }
  const db = await readLocal();
  const keys = new Set<string>();
  for (const g of db.creditGrants ?? []) {
    if (g.subscription_id === subscriptionId && g.kind === "monthly" && g.period_key) {
      keys.add(g.period_key);
    }
  }
  return [...keys].sort();
}

/**
 * Revoke EVERY monthly grant for a subscription cycle after a
 * refund. An annual invoice covers 12 dripped months, so revoking
 * only the invoice's month (the old behaviour) left months 1-11
 * in the buyer's balance while the drip kept granting. Each
 * month is revoked by the same refund fraction (full refund =
 * every month in full; partial refund = the same share of each
 * month), via revokeSubscriptionGrant, so a redelivery is safe:
 * already-revoked months revoke 0. On a FULL refund the
 * subscription row is stamped refunded_at, which excludes it
 * from listActiveAnnualSubscriptions and stops the drip. A
 * partial refund leaves refunded_at unset: the subscription
 * continues and the drip continues for future months. Returns
 * the total revoked and how many months were touched.
 */
/**
 * The YYYY-MM period keys in one billing cycle, starting from a
 * date (the invoice's creation month, which is the cycle start).
 * Monthly: just that month. Annual: that month + the next 11.
 * The webhook passes these to revokeAllSubscriptionGrants so a
 * refund only touches the refunded invoice's cycle — never a
 * previous or later cycle's months (Claude review of PR #94).
 */
export function cyclePeriodKeys(startDate: Date | string, interval: "monthly" | "annual"): string[] {
  const d = typeof startDate === "string" ? new Date(startDate) : startDate;
  const months = interval === "annual" ? 12 : 1;
  const keys: string[] = [];
  for (let i = 0; i < months; i++) {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + i;
    const year = y + Math.floor(m / 12);
    const month = (m % 12) + 1;
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
  }
  return keys;
}

/**
 * Revoke every monthly grant in ONE billing cycle after a refund.
 * The caller passes the cycle's period keys (from
 * cyclePeriodKeys, built from the refunded invoice's creation
 * month + billing interval) — a refund of the year-2 renewal
 * must not revoke year-1 months, and a monthly-plan refund
 * revokes only that month. A full refund also stamps
 * refunded_at on the subscription row, which excludes it
 * from listActiveAnnualSubscriptions and stops the drip. A
 * partial refund leaves refunded_at unset: the subscription
 * continues and the drip continues for future months. Returns
 * the total revoked and how many months were touched.
 *
 * The stamp goes FIRST and unconditionally on a full refund
 * (Claude review of PR #94): if the revoke loop throws after
 * revoking, a webhook retry finds nothing left to revoke
 * (periods 0) and would never stamp, leaving the plan dripping
 * forever. Stamping first is idempotent, and the per-month
 * already-revoked check keeps a retry from double-revoking.
 */
export async function revokeAllSubscriptionGrants(args: {
  userId: string;
  subscriptionId: string;
  /** The cycle's period keys (YYYY-MM) — only these months are revoked. */
  periodKeys: string[];
  /** Invoice total in cents (the cycle's charge). */
  totalCents: number;
  /** Cumulative refunded amount in cents; undefined/0 = full refund. */
  refundedCents?: number;
}): Promise<{ revoked: boolean; amount: number; periods: number }> {
  const isFullRefund =
    !args.refundedCents || args.refundedCents <= 0 || args.totalCents <= 0 || args.refundedCents >= args.totalCents;
  // Stamp first, unconditionally on a full refund (see the header
  // comment): the drip must stop even if the revoke loop throws
  // or there is nothing to revoke yet.
  if (isFullRefund) {
    await ensureSchema();
    if (usePostgres) {
      if (!pg) throw new Error("Database not configured");
      await sql`UPDATE subscriptions SET refunded_at = NOW(), updated_at = NOW()
        WHERE lemonsqueezy_subscription_id = ${args.subscriptionId}`;
    } else {
      const db = await readLocal();
      const row = (db.subscriptions ?? []).find(
        (s) => s.lemonsqueezy_subscription_id === args.subscriptionId
      );
      if (row) {
        row.refunded_at = new Date().toISOString();
        row.updated_at = new Date().toISOString();
        await writeLocal(db);
      }
    }
  }
  // Only the cycle's months, intersected with what was granted.
  // listGrantedSubscriptionPeriods returns every granted month
  // for the subscription (all cycles); the cycle filter is what
  // keeps a year-2 refund out of year-1 months.
  const granted = new Set(await listGrantedSubscriptionPeriods(args.subscriptionId));
  let amount = 0;
  let periods = 0;
  for (const periodKey of args.periodKeys) {
    if (!granted.has(periodKey)) continue;
    const result = await revokeSubscriptionGrant({
      userId: args.userId,
      subscriptionId: args.subscriptionId,
      periodKey,
      totalCents: args.totalCents,
      refundedCents: args.refundedCents,
    });
    if (result.revoked) {
      amount += result.amount;
      periods += 1;
    }
  }
  return { revoked: periods > 0, amount, periods };
}
