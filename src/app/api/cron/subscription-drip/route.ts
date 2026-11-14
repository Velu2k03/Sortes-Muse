import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  listActiveAnnualSubscriptions,
  listGrantedSubscriptionPeriods,
  grantMonthlyCredits,
} from "@/lib/db";

/**
 * Phase 2 batch 3: the annual subscription drip. An annual plan is
 * charged up front but its credits drip monthly (one month of the
 * plan per month), so a yearly buyer cannot spend the whole year
 * in week one. The webhook grants month 0 at signup / renewal;
 * this cron grants months 1-11 on the subscription's billing
 * anniversaries. It runs DAILY and grants every ungranted month
 * up to the current one, so a missed day is caught up the next
 * day, and a redelivery is a no-op (grantMonthlyCredits is
 * idempotent per subscription + period).
 *
 * Billing rules enforced here:
 * - past_due subscriptions get NO new grant (a failed payment
 *   freezes the drip until the payment succeeds).
 * - cancelled (grace-period) subscriptions KEEP dripping until the
 *   period ends (the year was paid for), unless the user has
 *   since started a newer live annual plan (then the new plan's
 *   drip covers them; see listActiveAnnualSubscriptions).
 * - refunded subscriptions get NO new grant (a full refund
 *   stamps refunded_at, which excludes the row).
 * - the drip month is the calendar month of the billing
 *   anniversary, never the 1st: granting on the 1st would hand
 *   out the next cycle's first month before its renewal charge.
 *
 * Vercel Cron calls this with `Authorization: Bearer <CRON_SECRET>`.
 * Configure in vercel.json and set CRON_SECRET in env vars.
 */

// The drip is a bounded daily job: one page of subscriptions at a
// time, and it skips months that already have a grant (one query
// per subscription) instead of one transaction per month.
export const maxDuration = 60;

const DRIP_PAGE_SIZE = 200;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  // Constant-time comparison for equal-length values (the length
  // check itself is the standard trade-off). Same pattern as
  // verifyWebhookSignature.
  const provided = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Page through every active annual subscription (the list is
  // capped at 500 per call; subscription 501+ must still drip).
  const now = new Date();
  let subscriptions = 0;
  let granted = 0;
  let skippedPastDue = 0;
  const errors: string[] = [];
  let offset = 0;
  for (;;) {
    const page = await listActiveAnnualSubscriptions(DRIP_PAGE_SIZE, offset);
    if (page.length === 0) break;
    offset += page.length;
    subscriptions += page.length;
    for (const sub of page) {
      // Failed payment: no new grant while past_due.
      if (sub.status === "past_due") {
        skippedPastDue += 1;
        continue;
      }
      const cycleStartRaw = sub.current_period_start ?? sub.created_at;
      const cycleStart = new Date(cycleStartRaw);
      if (Number.isNaN(cycleStart.getTime())) {
        errors.push(sub.lemonsqueezy_subscription_id);
        continue;
      }
      // Whole months since the cycle started, capped at 11 (month 0
      // is the signup/renewal month, granted by the webhook).
      const elapsed = Math.min(11, wholeMonthsBetween(cycleStart, now));
      // Skip months that already have a grant (one query, not one
      // transaction per month): a re-run after a partial failure
      // only touches the months still missing.
      const alreadyGranted = new Set(await listGrantedSubscriptionPeriods(sub.lemonsqueezy_subscription_id));
      for (let m = 0; m <= elapsed; m += 1) {
        const monthDate = addMonths(cycleStart, m);
        const periodKey = periodKeyForMonth(monthDate);
        if (alreadyGranted.has(periodKey)) continue;
        try {
          const result = await grantMonthlyCredits({
            userId: sub.user_id,
            subscriptionId: sub.lemonsqueezy_subscription_id,
            tier: sub.tier,
            periodKey,
            periodEnd: sub.current_period_end,
          });
          if (result.granted) granted += 1;
        } catch (err) {
          errors.push(sub.lemonsqueezy_subscription_id);
          console.error(
            JSON.stringify({
              source: "sortes-cron",
              event: "subscription-drip-failed",
              subscriptionId: sub.lemonsqueezy_subscription_id,
              periodKey,
              error: err instanceof Error ? err.message : String(err),
            })
          );
          break;
        }
      }
    }
    if (page.length < DRIP_PAGE_SIZE) break;
  }
  // One summary line for the run, so an alert can watch for a
  // rising error count or a stuck grant count.
  console.log(
    JSON.stringify({
      source: "sortes-cron",
      event: "subscription-drip-run",
      subscriptions,
      granted,
      skippedPastDue,
      errors: errors.length,
    })
  );
  return NextResponse.json({
    subscriptions,
    granted,
    skippedPastDue,
    errors: errors.length,
  });
}

/** Whole calendar months from start to end (the last month only counts once its day arrives). Exported for tests. */
export function wholeMonthsBetween(start: Date, end: Date): number {
  let months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth());
  if (end.getUTCDate() < start.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * The same UTC day-of-month, m months on, clamped to the last day
 * of the target month. Exported for tests. Date.UTC overflows an
 * invalid day into the NEXT month (Jan 31 + 1 month = Mar 3), so
 * without the clamp the drip cron would build the same YYYY-MM
 * key for two months and skip a grant as a duplicate — an annual
 * subscriber starting on the 29th-31st would receive fewer than
 * 12 months of credits.
 */
export function addMonths(d: Date, m: number): Date {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + m;
  // Day 0 of the month after the target is the target's last day.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDay);
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds()
    )
  );
}

/** YYYY-MM for a date (UTC). Exported for tests. */
export function periodKeyForMonth(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
