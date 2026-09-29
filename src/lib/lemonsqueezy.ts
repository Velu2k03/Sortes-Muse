import { createHmac, timingSafeEqual } from "crypto";

const API_BASE = "https://api.lemonsqueezy.com/v1";

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
  return map[packId] ?? null;
}

export function lemonConfigured(): boolean {
  return Boolean(
    process.env.LEMONSQUEEZY_API_KEY &&
      process.env.LEMONSQUEEZY_STORE_ID &&
      variantIdForPack("pack5") &&
      variantIdForPack("pack12") &&
      variantIdForPack("pack30")
  );
}

/** Pack id -> readings granted. Single source of truth for webhook fulfillment. */
export function readingsForVariant(variantId: string): number | null {
  if (variantId === process.env.LEMONSQUEEZY_VARIANT_PACK5) return 5;
  if (variantId === process.env.LEMONSQUEEZY_VARIANT_PACK12) return 12;
  if (variantId === process.env.LEMONSQUEEZY_VARIANT_PACK30) return 30;
  return null;
}

export function packIdForVariant(variantId: string): string {
  if (variantId === process.env.LEMONSQUEEZY_VARIANT_PACK5) return "pack5";
  if (variantId === process.env.LEMONSQUEEZY_VARIANT_PACK12) return "pack12";
  return "pack30";
}

export async function createCheckout(args: {
  packId: string;
  email?: string;
}): Promise<string> {
  const variantId = variantIdForPack(args.packId);
  const readings =
    args.packId === "pack5" ? 5 : args.packId === "pack12" ? 12 : 30;
  if (!variantId) throw new Error("Unknown pack.");
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tarot.resonantatlas.com";

  const res = await fetch(`${API_BASE}/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
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
            redirect_url: `${site}/credits?purchase=success`,
          },
        },
        relationships: {
          store: {
            data: { type: "stores", id: process.env.LEMONSQUEEZY_STORE_ID },
          },
          variant: { data: { type: "variants", id: variantId } },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Lemon Squeezy checkout failed (${res.status})`);
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

export async function getOrder(orderId: string) {
  const res = await fetch(`${API_BASE}/orders/${orderId}`, {
    headers: {
      Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
      Accept: "application/vnd.api+json",
    },
  });
  if (!res.ok) return null;
  return res.json();
}
