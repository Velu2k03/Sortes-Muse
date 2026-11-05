import { NextRequest, NextResponse } from "next/server";
import {
  verifyWebhookSignature,
  readingsForVariant,
  packIdForVariant,
  verifyOrderAmount,
} from "@/lib/lemonsqueezy";
import {
  getUserByEmail,
  createUser,
  fulfillOrder,
  revokeOrder,
} from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Lemon Squeezy webhook. Verifies the HMAC signature, then:
 * - `order_created`: verifies the store, currency and amount against
 *   the expected pack values, then fulfills atomically (transaction
 *   row + credit grant in one DB transaction, idempotent per order).
 * - `order_refunded`: revokes the granted credits idempotently,
 *   never driving the balance below 0.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get("x-signature");
  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let event: {
    meta?: { event_name?: string; custom_data?: { pack_id?: string } };
    data?: {
      id?: string;
      attributes?: {
        user_email?: string;
        total?: number;
        subtotal?: number;
        currency?: string;
        store_id?: number;
        status?: string;
        first_order_item?: { variant_id?: number };
      };
    };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const eventName = event.meta?.event_name;
  if (eventName === "order_refunded") {
    const orderId = event.data?.id ?? "";
    const result = await revokeOrder(orderId);
    if (!result.revoked) {
      console.warn(`[webhook] refund for order ${orderId}: nothing to revoke (no fulfillment, or already revoked).`);
    } else {
      console.warn(`[webhook] refund for order ${orderId}: revoked ${result.readings} credits.`);
    }
    return NextResponse.json({ ok: true, refunded: result.revoked });
  }

  if (eventName !== "order_created") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const attrs = event.data?.attributes;
  const email = (attrs?.user_email ?? "").trim().toLowerCase();
  const variantId = String(attrs?.first_order_item?.variant_id ?? "");
  const readings = readingsForVariant(variantId);
  if (!email || readings === null) {
    return NextResponse.json({ error: "Unrecognized order." }, { status: 400 });
  }
  if (attrs?.status && attrs.status !== "paid") {
    return NextResponse.json({ ok: true, ignored: "not paid" });
  }

  // Phase 1 (1.4): the order must be for this store, in USD, and for
  // the pack's price. A signed webhook is already authentic, so a
  // mismatch here means the store is misconfigured (wrong variant
  // price, tax/discount surprise) — refuse to grant, and log it loudly
  // instead of silently fulfilling the wrong pack.
  const expectedStoreId = process.env.LEMONSQUEEZY_STORE_ID;
  if (!expectedStoreId || String(attrs?.store_id ?? "") !== expectedStoreId) {
    console.error(`[webhook] order ${event.data?.id ?? "?"}: store_id mismatch (got ${attrs?.store_id}, expected ${expectedStoreId ?? "unset"}). Not fulfilling.`);
    return NextResponse.json({ error: "Store mismatch." }, { status: 400 });
  }
  if (attrs?.currency !== "USD") {
    console.error(`[webhook] order ${event.data?.id ?? "?"}: unexpected currency ${attrs?.currency}. Not fulfilling.`);
    return NextResponse.json({ error: "Unexpected currency." }, { status: 400 });
  }
  if (!verifyOrderAmount(attrs, variantId)) {
    console.error(`[webhook] order ${event.data?.id ?? "?"}: amount mismatch (total ${attrs?.total}, subtotal ${attrs?.subtotal}) for variant ${variantId}. Not fulfilling.`);
    return NextResponse.json({ error: "Amount mismatch." }, { status: 400 });
  }

  const orderId = event.data?.id ?? "";
  const user = (await getUserByEmail(email)) ?? (await createUser(email));
  const amount = Number(attrs?.total ?? 0) / 100;
  const result = await fulfillOrder({
    userId: user.id,
    email,
    packType: `${packIdForVariant(variantId)} (lemonsqueezy:${orderId})`,
    amount,
    readings,
    orderId,
  });
  if (result.duplicate) return NextResponse.json({ ok: true, duplicate: true });

  return NextResponse.json({ ok: true });
}
