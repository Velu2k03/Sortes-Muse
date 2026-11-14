import { NextRequest, NextResponse } from "next/server";
import { listActiveAnnualSubscriptions, grantMonthlyCredits } from "@/lib/db";

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
 *   period ends (the year was paid for).
 * - the drip month is the calendar month of the billing
 *   anniversary, never the 1st: granting on the 1st would hand
 *   out the next cycle's first month before its renewal charge.
 *
 * Vercel Cron calls this with `Authorization: Bearer <CRON_SECRET>`.
 * Configure in vercel.json and set CRON_SECRET in env vars.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subs = await listActiveAnnualSubscriptions();
  const now = new Date();
  let granted = 0;
  let skippedPastDue = 0;
  const errors: string[] = [];
  for (const sub of subs) {
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
    for (let m = 0; m <= elapsed; m += 1) {
      const monthDate = addMonths(cycleStart, m);
      const periodKey = periodKeyForMonth(monthDate);
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
  return NextResponse.json({
    subscriptions: subs.length,
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

/** The same UTC day-of-month, m months on (clamped by the Date constructor for short months). Exported for tests. */
export function addMonths(d: Date, m: number): Date {
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth() + m,
      d.getUTCDate(),
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
