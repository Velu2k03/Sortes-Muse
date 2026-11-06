import { NextRequest, NextResponse } from "next/server";
import {
  verifyWebhookSignature,
  readingsForVariant,
  packIdForVariant,
  verifyOrderAmount,
  getOrder,
  verifyApiOrder,
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
 *   the expected pack values in the signed payload, then confirms
 *   the order independently against the Lemon Squeezy API (Phase B,
 *   R4: paid, same order id, same store, same variant and amount)
 *   before fulfilling atomically (transaction row + credit grant in
 *   one DB transaction, idempotent per order). An API lookup failure
 *   or mismatch returns 500 so Lemon Squeezy retries; it never
 *   fulfils on an unverified order.
 * - `order_refunded`: verifies the store id in the payload (Phase B,
 *   R14) before revoking the granted credits idempotently, never
 *   driving the balance below 0.
 *
 * Phase B (R8): the fulfilment/revocation work runs inside a
 * try/catch. A database error returns a 500 with one structured log
 * line (source sortes-webhook, event webhook-error) instead of a
 * bare crash, so the failure is visible in the logs and Lemon
 * Squeezy retries. Reconciliation (scripts/reconcile.mjs) runs on a
 * schedule as a Phase H item; see docs/PRODUCTION-CHANGE-PLAN.md.
 */
export async function POST(req: NextRequest) {
  let eventName: string | null = null;
  let orderId = "";

  try {
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

    eventName = event.meta?.event_name ?? null;
    orderId = event.data?.id ?? "";

    // Phase G follow-up: a handled event with no order id can never
    // verify (getOrder("") returns null, which is the 500 path below)
    // and can never revoke anything. A 500 would make Lemon Squeezy
    // retry a payload that can never succeed, so a missing id is a
    // malformed payload: 400. Unknown event names keep the 200
    // ignored path below; only order_created and order_refunded
    // need an order id.
    if (!orderId && (eventName === "order_created" || eventName === "order_refunded")) {
      return NextResponse.json({ error: "Missing order id." }, { status: 400 });
    }

    if (eventName === "order_refunded") {
      // R14: the refund branch used to revoke with no store check at
      // all. A mismatched store id is refused outright. A missing
      // store_id is tolerated (and logged): older payloads may omit
      // it, the HMAC signature is still the authentication, and
      // revocation is idempotent and bounded by the original
      // fulfilment, so proceeding cannot grant anything.
      const expectedStoreId = process.env.LEMONSQUEEZY_STORE_ID;
      const refundStoreId = event.data?.attributes?.store_id;
      if (refundStoreId !== undefined && expectedStoreId !== undefined && String(refundStoreId) !== expectedStoreId) {
        console.error(`[webhook] refund for order ${orderId}: store_id mismatch (got ${refundStoreId}, expected ${expectedStoreId}). Not revoking.`);
        return NextResponse.json({ error: "Store mismatch." }, { status: 400 });
      }
      if (refundStoreId === undefined) {
        console.warn(`[webhook] refund for order ${orderId}: no store_id in payload, revoking on HMAC alone.`);
      }
      // Phase G follow-up: pass the payload email so a refund that
      // arrives before its fulfilment still leaves a traceable
      // pending-refund marker (revokeOrder records the email on
      // the marker row when there is no fulfilment to link to).
      const refundEmail = (event.data?.attributes?.user_email ?? "").trim().toLowerCase();
      const result = await revokeOrder(orderId, refundEmail);
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
      console.error(`[webhook] order ${orderId}: store_id mismatch (got ${attrs?.store_id}, expected ${expectedStoreId ?? "unset"}). Not fulfilling.`);
      return NextResponse.json({ error: "Store mismatch." }, { status: 400 });
    }
    if (attrs?.currency !== "USD") {
      console.error(`[webhook] order ${orderId}: unexpected currency ${attrs?.currency}. Not fulfilling.`);
      return NextResponse.json({ error: "Unexpected currency." }, { status: 400 });
    }
    if (!verifyOrderAmount(attrs, variantId)) {
      console.error(`[webhook] order ${orderId}: amount mismatch (total ${attrs?.total}, subtotal ${attrs?.subtotal}) for variant ${variantId}. Not fulfilling.`);
      return NextResponse.json({ error: "Amount mismatch." }, { status: 400 });
    }

    // Phase B (R4): confirm the order against the Lemon Squeezy API
    // before granting anything. The signed payload alone proves the
    // webhook secret holder sent it; the API lookup proves the order
    // really exists, is paid, and matches this store, variant, and
    // amount. A lookup failure (null) or any mismatch returns 500 so
    // Lemon Squeezy retries: a transient API outage must not drop a
    // paid order, and a genuinely mismatched order must not be
    // fulfilled while a human fixes the configuration.
    const apiOrder = await getOrder(orderId);
    if (!verifyApiOrder(apiOrder, { orderId, storeId: expectedStoreId, variantId })) {
      console.error(
        JSON.stringify({
          source: "sortes-webhook",
          event: "order-verify-failed",
          orderId,
          variantId,
        })
      );
      return NextResponse.json({ error: "Order could not be verified." }, { status: 500 });
    }

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
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        source: "sortes-webhook",
        event: "webhook-error",
        eventName: eventName ?? null,
        orderId: orderId || null,
        error: errMsg,
      })
    );
    const isNonTransient =
      errMsg.includes("User not found during fulfillment") ||
      errMsg.includes("User not found during refund");
    return NextResponse.json(
      { error: "Webhook processing failed." },
      { status: isNonTransient ? 400 : 500 }
    );
  }
}
