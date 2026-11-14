import {
  getSubscription,
  getSubscriptionInvoice,
  subscriptionVariantForId,
  verifyApiSubscription,
  verifyApiSubscriptionInvoice,
} from "./lemonsqueezy";
import { expectedCentsForSubscription } from "./subscription-tiers";
import {
  getUserByEmail,
  getUserById,
  createUser,
  grantMonthlyCredits,
  upsertSubscription,
  getSubscriptionByProviderId,
  expireMonthlyBalance,
  revokeAllSubscriptionGrants,
  cyclePeriodKeys,
  type DbUser,
} from "./db";

/*
 * Phase 2 batch 3: Lemon Squeezy subscription webhook handling.
 *
 * Events handled (the dashboard brief registers these on the test
 * webhook; the live webhook gets them after the test-mode
 * rehearsal):
 *   subscription_created   — upsert the subscription row (no grant;
 *                             the grant happens on payment success).
 *   subscription_updated   — sync status/tier/period (a tier change
 *                             takes effect at the next renewal).
 *   subscription_payment_success — a paid invoice. Grants ONE month
 *                             (monthly renewal, or the first month of
 *                             an annual cycle; the drip cron grants
 *                             the other 11 annual months). Skips
 *                             billing_reason "updated" (a plan-change
 *                             invoice is not a new month).
 *   subscription_payment_recovered — a previously failed charge
 *                             that later succeeded (card update /
 *                             retry). Routed through the same success
 *                             path as payment_success. Lemon Squeezy
 *                             docs say a payment_success is always
 *                             sent alongside a recovered event, so in
 *                             practice this is a second delivery of
 *                             the same paid invoice — and the grant is
 *                             idempotent per (subscription, period),
 *                             so the duplicate is a no-op. Handling
 *                             it anyway means the month is still
 *                             granted if Lemon Squeezy ever sends a
 *                             recovered event on its own.
 *   subscription_payment_failed — sync past_due, grant nothing.
 *   subscription_cancelled — grace period until ends_at; grants
 *                             continue until the period ends.
 *   subscription_expired  — zero the remaining monthly balance
 *                             (purchased credits untouched).
 *   subscription_resumed  — back to active.
 *   subscription_payment_refunded — revoke that period's grant.
 *
 * Every branch verifies against the Lemon Squeezy API before
 * writing (getSubscription / getSubscriptionInvoice), the same
 * pattern as the order branch: the signed payload alone never
 * grants. A verification failure is a 500 (retry). Grants are
 * idempotent per (subscription, period), so a redelivered event
 * cannot double-grant.
 */

export type SubscriptionWebhookResult = {
  status: number;
  body: Record<string, unknown>;
};

/** YYYY-MM for a date — the billing-period key for a monthly grant. */
export function periodKeyForDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

interface SubscriptionAttrs {
  status?: string;
  store_id?: number | string;
  customer_id?: number | string;
  first_subscription_item?: { variant_id?: number | string };
  renews_at?: string | null;
  ends_at?: string | null;
  created_at?: string;
  updated_at?: string;
  user_email?: string;
  urls?: { customer_portal?: string | null };
}

interface InvoiceAttrs {
  status?: string;
  store_id?: number | string;
  subscription_id?: number | string;
  customer_id?: number | string;
  user_email?: string;
  billing_reason?: string;
  total?: number | string;
  subtotal?: number | string;
  refunded_amount?: number;
  currency?: string;
  created_at?: string;
}

type WebhookEvent = {
  meta?: { event_name?: string; custom_data?: { user_id?: string } };
  data?: { id?: string | number; attributes?: Record<string, unknown> };
};

/**
 * Resolve the user for a subscription event. The checkout binds the
 * signed-in user id into meta.custom_data (step 1); renewals carry
 * no custom data, so the subscription row (step 2) or the payload
 * email (step 3) identifies the user. A custom_data user id for a
 * user that no longer exists is a 500 (never silently re-attribute),
 * the same rule as the order branch.
 */
async function resolveUser(
  event: WebhookEvent,
  email: string,
  subscriptionId: string
): Promise<DbUser> {
  const customUserId = String(event.meta?.custom_data?.user_id ?? "").trim();
  if (customUserId) {
    const signedIn = await getUserById(customUserId);
    if (!signedIn) throw new Error("User not found for this subscription.");
    return signedIn;
  }
  const existing = await getSubscriptionByProviderId(subscriptionId);
  if (existing) {
    const byId = await getUserById(existing.user_id);
    if (byId) return byId;
  }
  const clean = email.trim().toLowerCase();
  if (!clean) throw new Error("No user or email for this subscription.");
  return (await getUserByEmail(clean)) ?? (await createUser(clean));
}

async function upsertFromSubscriptionAttrs(
  userId: string,
  subscriptionId: string,
  attrs: SubscriptionAttrs,
  periodStart?: string | null
) {
  const variant = subscriptionVariantForId(String(attrs.first_subscription_item?.variant_id ?? ""));
  if (!variant) throw new Error("Unrecognized subscription variant.");
  return upsertSubscription({
    userId,
    lemonsqueezySubscriptionId: subscriptionId,
    lemonsqueezyCustomerId:
      attrs.customer_id !== undefined && attrs.customer_id !== null ? String(attrs.customer_id) : null,
    tier: variant.tier,
    billingInterval: variant.interval,
    status: String(attrs.status ?? "active"),
    // No invoice supplied a period start: pass null so the upsert
    // keeps the existing cycle start. Falling back to the
    // subscription's created_at here would reset the annual cycle
    // on every subscription_updated (renewals fire one), and the
    // drip cron would then re-grant year-1 months instead of the
    // new cycle's months.
    currentPeriodStart: periodStart ?? null,
    currentPeriodEnd: attrs.renews_at ?? attrs.ends_at ?? null,
    renewsAt: attrs.renews_at ?? null,
    endsAt: attrs.ends_at ?? null,
    cancelAtPeriodEnd: attrs.status === "cancelled",
  });
}

function log(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ source: "sortes-webhook", event, ...fields }));
}

function logError(event: string, fields: Record<string, unknown>) {
  console.error(JSON.stringify({ source: "sortes-webhook", event, ...fields }));
}

/**
 * Handle one subscription webhook event. Returns the HTTP status +
 * body the route should answer with. Throws on a transient failure
 * (the route turns it into a 500 so Lemon Squeezy retries).
 * Status split: config-class errors (store not configured, store
 * mismatch, unrecognized variant, unexpected currency, invoice
 * store mismatch) return 500 — Lemon Squeezy retries non-2xx
 * deliveries (bounded retries, a few attempts), so a 500 keeps the
 * event alive for a retry window while the config is fixed. The
 * daily reconcile cron is the real backstop if the retries run
 * out. Malformed payloads (missing subscription id) and data
 * inconsistencies (invoice subscription mismatch) return 400:
 * retrying those cannot help.
 */
export async function handleSubscriptionWebhook(
  eventName: string,
  event: WebhookEvent
): Promise<SubscriptionWebhookResult> {
  const expectedStoreId = process.env.LEMONSQUEEZY_STORE_ID?.trim();
  // The store id is required: verifyApiSubscription and
  // verifyApiSubscriptionInvoice both compare against it, and a
  // missing value would make every event fail verification. The
  // order branch refuses the same way when it is unset.
  if (!expectedStoreId) {
    logError("subscription-store-not-configured", { eventName });
    return { status: 500, body: { error: "Store not configured." } };
  }
  const dataId = String(event.data?.id ?? "");
  const attrs = (event.data?.attributes ?? {}) as Record<string, unknown>;

  if (!dataId) return { status: 400, body: { error: "Missing subscription id." } };
  if (String(attrs.store_id ?? "") !== expectedStoreId) {
    logError("subscription-store-mismatch", { eventName, id: dataId });
    return { status: 500, body: { error: "Store mismatch." } };
  }

  // --- Subscription-object events (created/updated/cancelled/expired/resumed/paused/unpaused) ---
  if (
    eventName === "subscription_created" ||
    eventName === "subscription_updated" ||
    eventName === "subscription_cancelled" ||
    eventName === "subscription_expired" ||
    eventName === "subscription_resumed" ||
    eventName === "subscription_paused" ||
    eventName === "subscription_unpaused"
  ) {
    const subAttrs = attrs as unknown as SubscriptionAttrs;
    // Verify against the API before writing anything.
    const apiSub = await getSubscription(dataId);
    if (!verifyApiSubscription(apiSub, { subscriptionId: dataId, storeId: expectedStoreId })) {
      logError("subscription-verify-failed", { eventName, subscriptionId: dataId });
      return { status: 500, body: { error: "Subscription could not be verified." } };
    }
    const apiAttrs = (apiSub as { data: { attributes: SubscriptionAttrs } }).data.attributes;
    const variant = subscriptionVariantForId(String(apiAttrs.first_subscription_item?.variant_id ?? ""));
    if (!variant) return { status: 500, body: { error: "Unrecognized subscription variant." } };
    // The user email is not on the Subscription object; the
    // subscription row (from an earlier event) or custom_data
    // identifies the user. A brand-new subscription_created always
    // carries custom_data.user_id from the checkout; the payload
    // email is the fallback.
    const user = await resolveUser(event, String(subAttrs.user_email ?? ""), dataId);
    const row = await upsertFromSubscriptionAttrs(user.id, dataId, apiAttrs);
    log("subscription-synced", { eventName, subscriptionId: dataId, userId: user.id, status: row.status, tier: row.tier });
    if (eventName === "subscription_expired") {
      const removed = await expireMonthlyBalance(user.id, dataId);
      log("subscription-monthly-expired", { subscriptionId: dataId, userId: user.id, removed });
    }
    return { status: 200, body: { ok: true } };
  }

  // --- Subscription-invoice events (payment success/failed/refunded/recovered) ---
  if (
    eventName === "subscription_payment_success" ||
    eventName === "subscription_payment_recovered" ||
    eventName === "subscription_payment_failed" ||
    eventName === "subscription_payment_refunded"
  ) {
    const invAttrs = attrs as unknown as InvoiceAttrs;
    const subscriptionId = String(invAttrs.subscription_id ?? "");
    if (!subscriptionId) return { status: 400, body: { error: "Missing subscription id." } };
    if (invAttrs.currency && invAttrs.currency !== "USD") {
      logError("subscription-invoice-currency", { eventName, invoiceId: dataId, currency: invAttrs.currency });
      return { status: 500, body: { error: "Unexpected currency." } };
    }
    // Fetch the subscription to learn the tier/interval (the invoice
    // carries no variant). Verify it against the API first.
    const apiSub = await getSubscription(subscriptionId);
    if (!verifyApiSubscription(apiSub, { subscriptionId, storeId: expectedStoreId })) {
      logError("subscription-verify-failed", { eventName, subscriptionId });
      return { status: 500, body: { error: "Subscription could not be verified." } };
    }
    const apiAttrs = (apiSub as { data: { attributes: SubscriptionAttrs } }).data.attributes;
    const variant = subscriptionVariantForId(String(apiAttrs.first_subscription_item?.variant_id ?? ""));
    if (!variant) return { status: 500, body: { error: "Unrecognized subscription variant." } };
    const expectedTotal = expectedCentsForSubscription(variant.tier, variant.interval);

    if (eventName === "subscription_payment_failed") {
      // No grant. Sync the status (past_due) so the account shows it
      // and the drip cron stops granting for this subscription.
      const user = await resolveUser(event, String(invAttrs.user_email ?? ""), subscriptionId);
      await upsertFromSubscriptionAttrs(user.id, subscriptionId, apiAttrs);
      log("subscription-payment-failed", { subscriptionId, userId: user.id });
      return { status: 200, body: { ok: true } };
    }

    if (eventName === "subscription_payment_refunded") {
      // Verify the invoice (it must be refunded/partial_refund, same
      // store + subscription + total) before revoking anything.
      const apiInv = await getSubscriptionInvoice(dataId);
      const inv = (apiInv as { data?: { attributes?: InvoiceAttrs } } | null)?.data?.attributes;
      if (!inv || (inv.status !== "refunded" && inv.status !== "partial_refund")) {
        logError("subscription-refund-verify-failed", { eventName, invoiceId: dataId });
        return { status: 500, body: { error: "Refund invoice could not be verified." } };
      }
      if (String(inv.store_id ?? "") !== expectedStoreId) {
        return { status: 500, body: { error: "Invoice store mismatch." } };
      }
      if (String(inv.subscription_id ?? "") !== subscriptionId) {
        return { status: 400, body: { error: "Invoice subscription mismatch." } };
      }
      const user = await resolveUser(event, String(invAttrs.user_email ?? ""), subscriptionId);
      // An annual invoice covers 12 dripped months: revoke every
      // monthly grant in THIS invoice's cycle, not just the
      // invoice's month — and never another cycle's months (a
      // year-2 renewal refund must not revoke year-1 months, and
      // a monthly-plan refund revokes only that month). The
      // cycle starts at the invoice's creation month. A full
      // refund also stamps refunded_at on the subscription row,
      // which stops the drip; a partial refund leaves the
      // subscription (and the drip) running. The period's charge is
      // the invoice total; the refunded amount comes from the
      // API-verified invoice (never the unverified payload).
      const totalCents = Number(inv.total ?? invAttrs.total ?? expectedTotal);
      const result = await revokeAllSubscriptionGrants({
        userId: user.id,
        subscriptionId,
        periodKeys: cyclePeriodKeys(invAttrs.created_at ?? new Date().toISOString(), variant.interval),
        totalCents,
        refundedCents: typeof inv.refunded_amount === "number" ? inv.refunded_amount : undefined,
      });
      log("subscription-refund-revoked", { subscriptionId, userId: user.id, revoked: result.revoked, amount: result.amount, periods: result.periods });
      return { status: 200, body: { ok: true, refunded: result.revoked } };
    }

    // subscription_payment_success / subscription_payment_recovered:
    // a paid invoice. Verify it (paid, same store + subscription,
    // amount matches the tier) before granting anything. A plan-change
    // invoice (billing_reason "updated") is not a new month — skip it.
    if (invAttrs.billing_reason === "updated") {
      log("subscription-invoice-updated-skipped", { subscriptionId, invoiceId: dataId });
      return { status: 200, body: { ok: true, ignored: "updated" } };
    }
    const apiInv = await getSubscriptionInvoice(dataId);
    if (
      !verifyApiSubscriptionInvoice(apiInv, {
        invoiceId: dataId,
        storeId: expectedStoreId,
        subscriptionId,
        expectedTotalCents: expectedTotal,
      })
    ) {
      logError("subscription-invoice-verify-failed", { eventName, invoiceId: dataId, subscriptionId });
      return { status: 500, body: { error: "Invoice could not be verified." } };
    }
    const user = await resolveUser(event, String(invAttrs.user_email ?? ""), subscriptionId);
    // The renewal starts a new period; the invoice date is its start.
    // A missing invoice date passes null (keep the existing start):
    // falling back to the subscription's created_at would reset an
    // annual cycle to year 1.
    const row = await upsertFromSubscriptionAttrs(
      user.id,
      subscriptionId,
      apiAttrs,
      invAttrs.created_at ?? null
    );
    // One month, idempotent per (subscription, period). Monthly
    // renewals and the first month of an annual cycle both land
    // here; the drip cron grants the other 11 annual months.
    const periodKey = periodKeyForDate(invAttrs.created_at ?? new Date().toISOString());
    const grant = await grantMonthlyCredits({
      userId: user.id,
      subscriptionId,
      tier: variant.tier,
      periodKey,
      periodEnd: row.current_period_end,
    });
    log("subscription-month-granted", {
      subscriptionId,
      userId: user.id,
      tier: variant.tier,
      interval: variant.interval,
      periodKey,
      granted: grant.granted,
      amount: grant.amount,
    });
    return { status: 200, body: { ok: true, granted: grant.granted, amount: grant.amount } };
  }

  return { status: 200, body: { ok: true, ignored: true } };
}
