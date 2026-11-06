import { createHmac, timingSafeEqual } from "crypto";
import { CREDIT_PACKS } from "./site";

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

export async function createCheckout(args: {
  packId: string;
  email?: string;
  fetchFn?: typeof fetch;
}): Promise<string> {
  const variantId = variantIdForPack(args.packId);
  const readings =
    args.packId === "pack5" ? 5 : args.packId === "pack12" ? 12 : 30;
  if (!variantId) throw new Error("Unknown pack.");
  const storeId = process.env.LEMONSQUEEZY_STORE_ID?.trim();
  if (!storeId) throw new Error("Lemon Squeezy store ID is not configured.");
  const apiKey = process.env.LEMONSQUEEZY_API_KEY?.trim();
  if (!apiKey) throw new Error("Lemon Squeezy API key is not configured.");

  const site = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://sortes.resonantatlas.com"
  ).replace(/\/+$/, "");

  const fetchFn = args.fetchFn ?? fetch;
  const res = await fetchFn(`${API_BASE}/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            ...(args.email ? { email: args.email } : {}),
            custom: { pack_id: args.packId, readings: String(readings) },
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
    }),
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
export async function getOrder(orderId: string, fetchFn: typeof fetch = fetch) {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY?.trim();
  if (!apiKey || !orderId) return null;
  try {
    const res = await fetchFn(`${API_BASE}/orders/${orderId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/vnd.api+json",
      },
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
