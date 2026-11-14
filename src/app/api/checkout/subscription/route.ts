import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  createVariantCheckout,
  subscriptionsConfigured,
  topUpsConfigured,
  variantIdForSubscriptionKey,
  variantIdForTopUp,
  type SubscriptionVariantKey,
} from "@/lib/lemonsqueezy";
import { getUserById } from "@/lib/db";
import { CREDIT_COSTS_ENABLED, isTopUpId } from "@/lib/subscription-tiers";
import { getActiveSubscriptionForUser } from "@/lib/db";
import { checkRateLimit, clientIp, ipLimitKey, rateLimitExceeded, RATE_LIMITS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const SUBSCRIPTION_KEYS: SubscriptionVariantKey[] = [
  "spark-monthly",
  "spark-annual",
  "star-monthly",
  "star-annual",
  "moon-monthly",
  "moon-annual",
];

/**
 * Phase 2 batch 3: checkout for a subscription tier or a top-up.
 * Sign-in is REQUIRED (unlike packs, which guests can buy by
 * email): a subscription is an account feature, and the webhook
 * binds the purchase to the signed-in user id in custom_data.
 * POST { kind: "subscription" | "topup", key } where key is a
 * subscription variant key ("star-monthly") or a top-up id
 * ("topup-1000"). 503 when the variants are not configured, and
 * 503 while the credit flag is OFF: a subscription/top-up grants
 * credits, and while the spend path still charges 1 per reading
 * those credits would buy 1,000 readings for $7.99 instead of
 * the planned 10. The flag flips first in the cutover, so the
 * checkout opens only once spending uses the credit unit.
 */
export async function POST(req: NextRequest) {
  if (!(await checkRateLimit(ipLimitKey("checkout", clientIp(req)), RATE_LIMITS.checkoutIp)).allowed) {
    return rateLimitExceeded();
  }
  let body: { kind?: string; key?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const kind = body.kind ?? "";
  const key = body.key ?? "";
  if (kind === "subscription" && !SUBSCRIPTION_KEYS.includes(key as SubscriptionVariantKey)) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }
  if (kind === "topup" && !isTopUpId(key)) {
    return NextResponse.json({ error: "Invalid top-up." }, { status: 400 });
  }
  if (kind !== "subscription" && kind !== "topup") {
    return NextResponse.json({ error: "Invalid checkout kind." }, { status: 400 });
  }

  let session: Awaited<ReturnType<typeof getSession>>;
  let email = "";
  try {
    session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sign in to subscribe or top up." }, { status: 401 });
    }
    const user = await getUserById(session.userId);
    email = user?.email ?? "";
  } catch (err) {
    console.error(
      JSON.stringify({
        source: "sortes-lemonsqueezy",
        event: "subscription-checkout-session-lookup-failed",
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return NextResponse.json(
      { error: "Checkout is temporarily unavailable. Please try again in a moment." },
      { status: 503 }
    );
  }
  if (!email) {
    return NextResponse.json({ error: "No email on this account." }, { status: 400 });
  }

  const configured = kind === "subscription" ? subscriptionsConfigured() : topUpsConfigured();
  if (!configured || !CREDIT_COSTS_ENABLED) {
    return NextResponse.json({ error: "Checkout not configured." }, { status: 503 });
  }
  if (kind === "subscription") {
    // One live subscription per user. A second concurrent plan
    // would leave two monthly grants in one pool, and the expiry
    // of either would zero credits the other one granted. A
    // cancelled (grace-period) row does not block: the user is
    // re-subscribing after cancelling.
    const existing = await getActiveSubscriptionForUser(session.userId);
    if (existing && existing.status !== "cancelled") {
      return NextResponse.json(
        { error: "You already have an active subscription. Manage or cancel it from your account first." },
        { status: 409 }
      );
    }
  }
  const variantId =
    kind === "subscription"
      ? variantIdForSubscriptionKey(key as SubscriptionVariantKey)
      : variantIdForTopUp(key as "topup-1000" | "topup-3000");
  if (!variantId) {
    return NextResponse.json({ error: "Checkout not configured." }, { status: 503 });
  }

  try {
    const url = await createVariantCheckout({
      variantId,
      kind,
      itemId: key,
      email,
      userId: session.userId,
    });
    return NextResponse.json({ url });
  } catch (err) {
    console.error(
      JSON.stringify({
        source: "sortes-lemonsqueezy",
        event: "subscription-checkout-route-error",
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return NextResponse.json(
      { error: "Could not start checkout. Please try again." },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    subscriptions: subscriptionsConfigured() && CREDIT_COSTS_ENABLED,
    topups: topUpsConfigured() && CREDIT_COSTS_ENABLED,
  });
}
