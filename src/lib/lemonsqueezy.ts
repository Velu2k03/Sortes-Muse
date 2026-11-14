import { createHmac, timingSafeEqual } from "crypto";
import { CREDIT_PACKS } from "./site";
import { expectedCentsForTopUp } from "./subscription-tiers";

// Phase B (R4): the API base is overridable for local testing only
// (LEMONSQUEEZY_API_BASE, e.g. a mock server on localhost for the
// webhook simulator). Unset everywhere else: production, staging,
// and Preview all use the real Lemon Squeezy API. Never set this on
// Vercel; a wrong value here breaks checkout and webhook
// verification, it cannot mint credits.
const API_BASE = (process.env.LEMONSQUEEZY_API_BASE?.trim().replace(/\/+$/, "") ||
  "https://api.lemonsqueezy.com/v1");

export interface LemonPack {
  id: string;
  readings: number;
  price: number;
}

/** Pack id -> Lemon Squeezy variant id, from env. */
export function variantIdForPack(packId: string): string | null {
  const map: Record<string, string | undefined> = {
    pack5: process.env.LEMONSQUEEZY_VARIANT_PACK5,
    pack12: process.env.LEMONSQUEEZY_VARIANT_PACK12,
    pack30: process.env.LEMONSQUEEZY_VARIANT_PACK30,
  };
  const val = map[packId]?.trim();
  return val || null;
}

export function lemonConfigured(): boolean {
  return Boolean(
    process.env.LEMONSQUEEZY_API_KEY?.trim() &&
      process.env.LEMONSQUEEZY_STORE_ID?.trim() &&
      variantIdForPack("pack5") &&
      variantIdForPack("pack12") &&
      variantIdForPack("pack30")
  );
}

/** Pack id -> readings granted. Single source of truth for webhook fulfillment. */
export function readingsForVariant(variantId: string): number | null {
  const trimmed = variantId.trim();
  if (trimmed === process.env.LEMONSQUEEZY_VARIANT_PACK5?.trim()) return 5;
  if (trimmed === process.env.LEMONSQUEEZY_VARIANT_PACK12?.trim()) return 12;
  if (trimmed === process.env.LEMONSQUEEZY_VARIANT_PACK30?.trim()) return 30;
  return null;
}

export function packIdForVariant(variantId: string): string {
  const trimmed = variantId.trim();
  if (trimmed === process.env.LEMONSQUEEZY_VARIANT_PACK5?.trim()) return "pack5";
  if (trimmed === process.env.LEMONSQUEEZY_VARIANT_PACK12?.trim()) return "pack12";
  return "pack30";
}

/*
 * Phase 2 batch 3: subscription + top-up variants. The IDs live in
 * env vars only (never hardcoded); the dashboard brief
 * (sortes-verify/lemonsqueezy-dashboard-brief-batch-B.md) is where
 * they are created. Until the variants exist and the vars are set,
 * every function here returns null and checkout reports "not
 * configured" — subscriptions simply do not sell yet.
 */

export type SubscriptionVariantKey =
  | "spark-monthly"
  | "spark-annual"
  | "star-monthly"
  | "star-annual"
  | "moon-monthly"
  | "moon-annual";

export interface SubscriptionVariant {
  key: SubscriptionVariantKey;
  tier: "spark" | "star" | "moon";
  interval: "monthly" | "annual";
}

const SUBSCRIPTION_VARIANT_ENVS: Record<SubscriptionVariantKey, string> = {
  "spark-monthly": "LEMONSQUEEZY_VARIANT_SUB_SPARK_M",
  "spark-annual": "LEMONSQUEEZY_VARIANT_SUB_SPARK_Y",
  "star-monthly": "LEMONSQUEEZY_VARIANT_SUB_STAR_M",
  "star-annual": "LEMONSQUEEZY_VARIANT_SUB_STAR_Y",
  "moon-monthly": "LEMONSQUEEZY_VARIANT_SUB_MOON_M",
  "moon-annual": "LEMONSQUEEZY_VARIANT_SUB_MOON_Y",
};

const SUBSCRIPTION_VARIANT_KEYS: SubscriptionVariantKey[] = [
  "spark-monthly",
  "spark-annual",
  "star-monthly",
  "star-annual",
  "moon-monthly",
  "moon-annual",
];

/** Subscription variant key -> Lemon Squeezy variant id, from env. */
export function variantIdForSubscriptionKey(key: SubscriptionVariantKey): string | null {
  const val = process.env[SUBSCRIPTION_VARIANT_ENVS[key]]?.trim();
  return val || null;
}

/** Lemon Squeezy variant id -> subscription tier + interval, or null. */
export function subscriptionVariantForId(variantId: string): SubscriptionVariant | null {
  const trimmed = variantId.trim();
  for (const key of SUBSCRIPTION_VARIANT_KEYS) {
    if (trimmed === process.env[SUBSCRIPTION_VARIANT_ENVS[key]]?.trim()) {
      const [tier, interval] = key.split("-") as ["spark" | "star" | "moon", "monthly" | "annual"];
      return { key, tier, interval };
    }
  }
  return null;
}

/** Are all six subscription variants configured? */
export function subscriptionsConfigured(): boolean {
  return SUBSCRIPTION_VARIANT_KEYS.every((k) => variantIdForSubscriptionKey(k));
}

/** Top-up id -> Lemon Squeezy variant id, from env. */
export function variantIdForTopUp(id: "topup-1000" | "topup-3000"): string | null {
  const env = id === "topup-1000" ? "LEMONSQUEEZY_VARIANT_TOPUP_1000" : "LEMONSQUEEZY_VARIANT_TOPUP_3000";
  const val = process.env[env]?.trim();
  return val || null;
}

/** Lemon Squeezy variant id -> top-up credits granted, or null. */
export function topUpCreditsForVariant(variantId: string): number | null {
  const trimmed = variantId.trim();
  if (trimmed === process.env.LEMONSQUEEZY_VARIANT_TOPUP_1000?.trim()) return 1000;
  if (trimmed === process.env.LEMONSQUEEZY_VARIANT_TOPUP_3000?.trim()) return 3000;
  return null;
}

/** Lemon Squeezy variant id -> top-up id ("topup-1000" / "topup-3000"), or null. */
export function topUpIdForVariant(variantId: string): "topup-1000" | "topup-3000" | null {
  const credits = topUpCreditsForVariant(variantId);
  if (credits === 1000) return "topup-1000";
  if (credits === 3000) return "topup-3000";
  return null;
}

/** Are both top-up variants configured? */
export function topUpsConfigured(): boolean {
  return Boolean(variantIdForTopUp("topup-1000") && variantIdForTopUp("topup-3000"));
}

/**
 * Expected charge for a variant, in cents, derived from CREDIT_PACKS
 * (the single price source of truth). Null for an unknown variant.
 */
export function expectedTotalCentsForVariant(variantId: string): number | null {
  const readings = readingsForVariant(variantId);
  if (readings === null) return null;
  const pack = CREDIT_PACKS.find((p) => p.readings === readings);
  return pack ? Math.round(pack.price * 100) : null;
}

/**
 * Phase 1 (1.4): does this order's money match its variant? Accepts
 * an exact total, or a subtotal that matches with a higher total
 * (tax added on top of the pack price). Rejects discounts and
 * underpayment: a subtotal that matches but a total below the pack
 * price means the buyer did not pay full price. Lemon Squeezy sends
 * total/subtotal in cents.
 */
export function verifyOrderAmount(
  attrs: { total?: number | string; subtotal?: number | string },
  variantId: string
): boolean {
  const expected = expectedTotalCentsForVariant(variantId);
  if (expected === null) return false;
  const total = Number(attrs.total);
  if (total === expected) return true;
  const subtotal = Number(attrs.subtotal);
  if (subtotal === expected && total > expected) return true;
  return false;
}

/**
 * Phase 2 batch 3: the same amount rule as verifyOrderAmount, for a
 * top-up variant. The expected charge comes from the top-up id
 * (1,000 credits $9.99, 3,000 credits $24.99). A pack variant
 * returns false here — top-ups and packs are verified by different
 * functions, so a misconfigured variant can never pass the wrong
 * check.
 */
export function verifyTopUpOrderAmount(
  attrs: { total?: number | string; subtotal?: number | string },
  variantId: string
): boolean {
  const credits = topUpCreditsForVariant(variantId);
  if (credits === null) return false;
  const expected = expectedCentsForTopUp(credits === 1000 ? "topup-1000" : "topup-3000");
  const total = Number(attrs.total);
  if (total === expected) return true;
  const subtotal = Number(attrs.subtotal);
  if (subtotal === expected && total > expected) return true;
  return false;
}

/** Shared POST /checkouts: one place builds the request and reads the URL. */
async function postCheckout(
  body: unknown,
  fetchFn: typeof fetch,
  timeoutMs: number
): Promise<string> {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY?.trim();
  if (!apiKey) throw new Error("Lemon Squeezy API key is not configured.");
  const res = await fetchFn(`${API_BASE}/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch {
      bodyText = "<failed to read response body>";
    }
    const truncatedBody = bodyText.slice(0, 500);
    console.error(
      JSON.stringify({
        source: "sortes-lemonsqueezy",
        event: "checkout-failed",
        status: res.status,
        response: truncatedBody,
      })
    );
    throw new Error(
      `Lemon Squeezy checkout failed (${res.status}): ${truncatedBody}`
    );
  }

  const data = await res.json();
  const url: string | undefined = data?.data?.attributes?.url;
  if (!url) throw new Error("Lemon Squeezy returned no checkout URL.");
  return url;
}

export async function createCheckout(args: {
  packId: string;
  email?: string;
  // Bug 1 fix: the signed-in user's id, bound into
  // checkout_data.custom so the webhook can attribute the paid
  // order to the signed-in account even when Lemon Squeezy reports
  // the Link account's email. Omitted for guest checkouts.
  userId?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}): Promise<string> {
  const variantId = variantIdForPack(args.packId);
  const readings =
    args.packId === "pack5" ? 5 : args.packId === "pack12" ? 12 : 30;
  if (!variantId) throw new Error("Unknown pack.");
  const storeId = process.env.LEMONSQUEEZY_STORE_ID?.trim();
  if (!storeId) throw new Error("Lemon Squeezy store ID is not configured.");

  const site = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://sortes.resonantatlas.com"
  ).replace(/\/+$/, "");

  const fetchFn = args.fetchFn ?? fetch;
  const timeoutMs = args.timeoutMs ?? 10000;
  return postCheckout(
    {
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            ...(args.email ? { email: args.email } : {}),
            custom: {
              pack_id: args.packId,
              readings: String(readings),
              ...(args.userId ? { user_id: args.userId } : {}),
            },
          },
          product_options: {
            redirect_url: `${site}/oracles?purchase=success`,
          },
        },
        relationships: {
          store: {
            data: { type: "stores", id: storeId },
          },
          variant: { data: { type: "variants", id: variantId } },
        },
      },
    },
    fetchFn,
    timeoutMs
  );
}

/**
 * Phase 2 batch 3: checkout for a subscription variant or a top-up
 * variant. The `kind` in custom_data is what the webhook uses to
 * tell a subscription order from a top-up order (both arrive as
 * order_created). Subscriptions redirect to /account, where the
 * subscription status shows; top-ups redirect to /oracles, where
 * the purchased balance shows.
 */
export async function createVariantCheckout(args: {
  variantId: string;
  kind: "subscription" | "topup";
  /** Subscription variant key (e.g. "star-monthly") or top-up id. */
  itemId: string;
  email?: string;
  userId?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}): Promise<string> {
  const storeId = process.env.LEMONSQUEEZY_STORE_ID?.trim();
  if (!storeId) throw new Error("Lemon Squeezy store ID is not configured.");
  const site = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://sortes.resonantatlas.com"
  ).replace(/\/+$/, "");
  const fetchFn = args.fetchFn ?? fetch;
  const timeoutMs = args.timeoutMs ?? 10000;
  return postCheckout(
    {
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            ...(args.email ? { email: args.email } : {}),
            custom: {
              kind: args.kind,
              item_id: args.itemId,
              ...(args.userId ? { user_id: args.userId } : {}),
            },
          },
          product_options: {
            redirect_url:
              args.kind === "subscription"
                ? `${site}/account?subscription=success`
                : `${site}/oracles?purchase=success`,
          },
        },
        relationships: {
          store: {
            data: { type: "stores", id: storeId },
          },
          variant: { data: { type: "variants", id: args.variantId } },
        },
      },
    },
    fetchFn,
    timeoutMs
  );
}

export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(digest);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Phase B (R4): fetch one order from the Lemon Squeezy API.
 * Returns the parsed JSON:API payload, or null when the order cannot
 * be retrieved (no API key, non-OK status, network failure, bad
 * JSON). Null means "unverified": the webhook caller must refuse to
 * fulfil and return 500 so Lemon Squeezy retries. Never throws.
 * fetchFn is injectable so tests and the local webhook simulator
 * never call the live API.
 */
export async function getOrder(
  orderId: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 8000
) {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY?.trim();
  if (!apiKey || !orderId) return null;
  try {
    const res = await fetchFn(`${API_BASE}/orders/${orderId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/vnd.api+json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Phase B (R4): does the order the API returned match the order the
 * webhook claims? The order must be paid, belong to the expected
 * store, be the same order id, and match the variant and amount the
 * webhook payload named. Any mismatch or malformed payload is false.
 * The amount check reuses verifyOrderAmount, so tax-on-top is
 * accepted and discounts/underpayment are rejected, exactly as for
 * the payload check.
 */
export function verifyApiOrder(
  order: unknown,
  expected: { orderId: string; storeId: string; variantId: string }
): boolean {
  if (!order || typeof order !== "object") return false;
  const data = (order as { data?: unknown }).data;
  if (!data || typeof data !== "object") return false;
  const { id, attributes } = data as { id?: unknown; attributes?: unknown };
  if (id !== expected.orderId) return false;
  if (!attributes || typeof attributes !== "object") return false;
  const attrs = attributes as {
    status?: unknown;
    store_id?: unknown;
    first_order_item?: { variant_id?: unknown };
  };
  if (attrs.status !== "paid") return false;
  if (String(attrs.store_id ?? "") !== expected.storeId) return false;
  const variantId = String(attrs.first_order_item?.variant_id ?? "");
  if (variantId !== expected.variantId) return false;
  return verifyOrderAmount(
    attrs as { total?: number | string; subtotal?: number | string },
    expected.variantId
  );
}

/**
 * Phase 2 batch 3: the top-up twin of verifyApiOrder. Same checks
 * (paid, same store, same order id, same variant) but the amount
 * is checked against the top-up price, not a pack price.
 * verifyApiOrder returns false for a top-up variant (its amount
 * check is pack-derived), so a top-up order must come here.
 */
export function verifyApiTopUpOrder(
  order: unknown,
  expected: { orderId: string; storeId: string; variantId: string }
): boolean {
  if (!order || typeof order !== "object") return false;
  const data = (order as { data?: unknown }).data;
  if (!data || typeof data !== "object") return false;
  const { id, attributes } = data as { id?: unknown; attributes?: unknown };
  if (id !== expected.orderId) return false;
  if (!attributes || typeof attributes !== "object") return false;
  const attrs = attributes as {
    status?: unknown;
    store_id?: unknown;
    first_order_item?: { variant_id?: unknown };
  };
  if (attrs.status !== "paid") return false;
  if (String(attrs.store_id ?? "") !== expected.storeId) return false;
  const variantId = String(attrs.first_order_item?.variant_id ?? "");
  if (variantId !== expected.variantId) return false;
  return verifyTopUpOrderAmount(
    attrs as { total?: number | string; subtotal?: number | string },
    expected.variantId
  );
}

/*
 * Phase 2 batch 3: subscription API helpers. Same pattern as the
 * order helpers above (fetch, null on any failure, never throw;
 * verify against the expected store/variant/status so a signed
 * payload alone never grants). Shapes from the official Lemon
 * Squeezy API docs (subscription + subscription-invoice objects,
 * read 2026-11-14): a Subscription carries status, renews_at,
 * ends_at, first_subscription_item.variant_id, customer_id and
 * urls.customer_portal; a subscription invoice carries
 * subscription_id, billing_reason (initial/renewal/updated),
 * status (paid/pending/void/refunded/partial_refund), total,
 * refunded_amount and user_email.
 */

/** Fetch one subscription from the Lemon Squeezy API. Null when it cannot be retrieved. */
export async function getSubscription(
  subscriptionId: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 8000
) {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY?.trim();
  if (!apiKey || !subscriptionId) return null;
  try {
    const res = await fetchFn(`${API_BASE}/subscriptions/${subscriptionId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/vnd.api+json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Does the subscription the API returned match the one the webhook
 * claims? Same id, same store, and a variant we sell. The status is
 * NOT required to be active here — cancelled/past_due/expired
 * subscriptions are real subscriptions whose status the webhook
 * must sync, not refuse.
 */
export function verifyApiSubscription(
  subscription: unknown,
  expected: { subscriptionId: string; storeId: string }
): boolean {
  if (!subscription || typeof subscription !== "object") return false;
  const data = (subscription as { data?: unknown }).data;
  if (!data || typeof data !== "object") return false;
  const { id, attributes } = data as { id?: unknown; attributes?: unknown };
  if (String(id ?? "") !== expected.subscriptionId) return false;
  if (!attributes || typeof attributes !== "object") return false;
  const attrs = attributes as {
    store_id?: unknown;
    first_subscription_item?: { variant_id?: unknown };
  };
  if (String(attrs.store_id ?? "") !== expected.storeId) return false;
  const variantId = String(attrs.first_subscription_item?.variant_id ?? "");
  return subscriptionVariantForId(variantId) !== null;
}

/** Fetch one subscription invoice from the Lemon Squeezy API. Null when it cannot be retrieved. */
export async function getSubscriptionInvoice(
  invoiceId: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 8000
) {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY?.trim();
  if (!apiKey || !invoiceId) return null;
  try {
    const res = await fetchFn(`${API_BASE}/subscription-invoices/${invoiceId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/vnd.api+json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Does the invoice the API returned match the one the webhook
 * claims? Same id, same store, same subscription, status paid, and
 * the total matches the expected charge for that subscription's
 * tier + interval (tax-on-top accepted, discounts/underpayment
 * refused — the same rule as verifyOrderAmount). A mismatch is a
 * 500 (retry), never a grant.
 */
export function verifyApiSubscriptionInvoice(
  invoice: unknown,
  expected: {
    invoiceId: string;
    storeId: string;
    subscriptionId: string;
    expectedTotalCents: number;
  }
): boolean {
  if (!invoice || typeof invoice !== "object") return false;
  const data = (invoice as { data?: unknown }).data;
  if (!data || typeof data !== "object") return false;
  const { id, attributes } = data as { id?: unknown; attributes?: unknown };
  if (String(id ?? "") !== expected.invoiceId) return false;
  if (!attributes || typeof attributes !== "object") return false;
  const attrs = attributes as {
    status?: unknown;
    store_id?: unknown;
    subscription_id?: unknown;
    total?: number | string;
    subtotal?: number | string;
  };
  if (attrs.status !== "paid") return false;
  if (String(attrs.store_id ?? "") !== expected.storeId) return false;
  if (String(attrs.subscription_id ?? "") !== expected.subscriptionId) return false;
  const total = Number(attrs.total);
  if (total === expected.expectedTotalCents) return true;
  const subtotal = Number(attrs.subtotal);
  if (subtotal === expected.expectedTotalCents && total > expected.expectedTotalCents) return true;
  return false;
}

/**
 * PATCH a subscription (cancel, resume, or change variant). Returns
 * the parsed API response, or null on any failure (never throws).
 * PayPal subscriptions cannot be updated via the API — the response
 * then carries urls.customer_portal_update_subscription instead;
 * callers must send the customer there. See the Update-a-Subscription
 * API doc (read 2026-11-14).
 */
export async function updateSubscription(
  subscriptionId: string,
  patch: Record<string, unknown>,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 8000
) {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY?.trim();
  if (!apiKey || !subscriptionId) return null;
  try {
    const res = await fetchFn(`${API_BASE}/subscriptions/${subscriptionId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/vnd.api+json",
        Accept: "application/vnd.api+json",
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ data: { type: "subscriptions", id: subscriptionId, attributes: patch } }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
