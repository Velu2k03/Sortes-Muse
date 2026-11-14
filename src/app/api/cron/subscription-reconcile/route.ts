import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { listSubscriptionInvoices } from "@/lib/lemonsqueezy";
import { listGrantedSubscriptionPeriods } from "@/lib/db";
import {
  toReconcileInvoices,
  findMissingPaidGrants,
} from "@/lib/subscription-reconcile";

/**
 * Notes N2 (B4c): the daily subscription reconcile. Lists the last
 * 50 subscription invoices for the store from the Lemon Squeezy API
 * and checks each PAID invoice has a monthly grant in the database.
 * REPORT-ONLY: it never grants or writes credits. A missing grant
 * means a paid month the webhook never granted (missed delivery,
 * a config error that has since been fixed, a verification failure
 * whose retries ran out) — a human verifies it in the Lemon Squeezy
 * dashboard and re-delivers the webhook or grants by hand.
 *
 * One JSON summary line is logged per run (event
 * subscription-reconcile-run) so an alert can watch for a missing
 * count above zero; see docs/CREDIT-CUTOVER-RUNBOOK.md.
 *
 * Vercel Cron calls this with `Authorization: Bearer <CRON_SECRET>`.
 * Configure in vercel.json and set CRON_SECRET in env vars.
 */

export const maxDuration = 60;

const RECONCILE_LIMIT = 50;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  // Constant-time comparison for equal-length values (the length
  // check itself is the standard trade-off). Same pattern as the
  // drip cron and verifyWebhookSignature.
  const provided = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const storeId = process.env.LEMONSQUEEZY_STORE_ID?.trim();
  if (!storeId) {
    console.error(
      JSON.stringify({
        source: "sortes-cron",
        event: "subscription-reconcile-failed",
        error: "LEMONSQUEEZY_STORE_ID is not configured",
      })
    );
    return NextResponse.json({ error: "Store not configured" }, { status: 500 });
  }
  const payload = await listSubscriptionInvoices(storeId, undefined, undefined, RECONCILE_LIMIT);
  if (!payload) {
    console.error(
      JSON.stringify({
        source: "sortes-cron",
        event: "subscription-reconcile-failed",
        error: "Lemon Squeezy invoice list could not be retrieved",
      })
    );
    return NextResponse.json({ error: "Invoice list could not be retrieved" }, { status: 500 });
  }

  const invoices = toReconcileInvoices(payload);
  // One grant-list query per subscription that has a paid invoice
  // (not one per invoice): several invoices can share a subscription.
  const granted = new Map<string, Set<string>>();
  for (const inv of invoices) {
    if (inv.status !== "paid" || granted.has(inv.subscriptionId)) continue;
    granted.set(
      inv.subscriptionId,
      new Set(await listGrantedSubscriptionPeriods(inv.subscriptionId))
    );
  }
  const { checked, missing } = findMissingPaidGrants(invoices, granted);
  const summary = {
    checked,
    missing: missing.length,
    missingSubscriptions: [...new Set(missing.map((m) => m.subscriptionId))],
    missingPeriods: missing.map((m) => `${m.subscriptionId}:${m.periodKey}`),
  };
  console.log(
    JSON.stringify({
      source: "sortes-cron",
      event: "subscription-reconcile-run",
      ...summary,
    })
  );
  return NextResponse.json(summary);
}
