import { periodKeyForDate } from "./subscription-webhook";

/**
 * Notes N2 (B4c): the daily subscription reconcile — report-only.
 * Lists the store's recent subscription invoices from Lemon Squeezy
 * and checks each PAID invoice has a monthly grant in the database
 * for that subscription + period. It never grants or writes
 * credits; a missing grant is a human's job (verify in the Lemon
 * Squeezy dashboard, then re-deliver the webhook or grant by hand).
 * The cron route logs one JSON summary line an alert can watch.
 */

export interface ReconcileInvoice {
  subscriptionId: string;
  periodKey: string;
  status: string;
}

export interface MissingGrant {
  subscriptionId: string;
  periodKey: string;
}

/**
 * Pull the reconcile fields out of a Lemon Squeezy list response
 * (JSON:API: data[] of subscription-invoice objects). Malformed
 * entries (no subscription id, no date) are dropped — they cannot
 * be matched to a grant, and the cron logs the checked count, so
 * a short list is visible.
 */
export function toReconcileInvoices(payload: unknown): ReconcileInvoice[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const out: ReconcileInvoice[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const attrs = (item as { attributes?: unknown }).attributes;
    if (!attrs || typeof attrs !== "object") continue;
    const a = attrs as { subscription_id?: unknown; created_at?: unknown; status?: unknown };
    const subscriptionId = String(a.subscription_id ?? "").trim();
    const createdAt = String(a.created_at ?? "").trim();
    if (!subscriptionId || !createdAt) continue;
    out.push({
      subscriptionId,
      periodKey: periodKeyForDate(createdAt),
      status: String(a.status ?? ""),
    });
  }
  return out;
}

/**
 * Pure comparison: of the PAID invoices, which have no monthly
 * grant for (subscription, period)? `granted` maps a subscription
 * id to the set of period keys that already have a monthly grant
 * (from listGrantedSubscriptionPeriods). Non-paid invoices
 * (pending, refunded, void) are counted in `checked` only when
 * they are paid — a refunded invoice's grant is revoked, not
 * missing, so it must not show up here.
 */
export function findMissingPaidGrants(
  invoices: ReconcileInvoice[],
  granted: ReadonlyMap<string, ReadonlySet<string>>
): { checked: number; missing: MissingGrant[] } {
  let checked = 0;
  const missing: MissingGrant[] = [];
  for (const inv of invoices) {
    if (inv.status !== "paid") continue;
    checked += 1;
    if (!granted.get(inv.subscriptionId)?.has(inv.periodKey)) {
      missing.push({ subscriptionId: inv.subscriptionId, periodKey: inv.periodKey });
    }
  }
  return { checked, missing };
}
