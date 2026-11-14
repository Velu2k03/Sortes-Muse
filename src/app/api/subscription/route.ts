import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getActiveSubscriptionForUser, getCreditBalances } from "@/lib/db";
import { getSubscription } from "@/lib/lemonsqueezy";

export const dynamic = "force-dynamic";

/**
 * Phase 2 batch 3: the signed-in user's subscription status.
 * Returns the active subscription (tier, interval, status, period
 * end, renews_at) plus the Lemon Squeezy customer portal URL, so
 * the account page can offer cancel / payment-method changes
 * (PayPal subscriptions cannot be updated via the API — the portal
 * is the only route). No subscription: { subscription: null }.
 * The portal URL comes from the live API, not the stored row.
 */
export async function GET() {
  let session: Awaited<ReturnType<typeof getSession>>;
  try {
    session = await getSession();
  } catch {
    return NextResponse.json({ error: "Could not load your subscription." }, { status: 503 });
  }
  if (!session) {
    return NextResponse.json({ error: "Sign in to see your subscription." }, { status: 401 });
  }
  const sub = await getActiveSubscriptionForUser(session.userId);
  if (!sub) return NextResponse.json({ subscription: null });
  const balances = await getCreditBalances(session.userId);
  let portalUrl: string | null = null;
  try {
    const apiSub = (await getSubscription(sub.lemonsqueezy_subscription_id)) as {
      data?: { attributes?: { urls?: { customer_portal?: string | null } } };
    } | null;
    portalUrl = apiSub?.data?.attributes?.urls?.customer_portal ?? null;
  } catch {
    // A failed portal lookup is not fatal: the status still shows.
    portalUrl = null;
  }
  return NextResponse.json({
    subscription: {
      tier: sub.tier,
      billingInterval: sub.billing_interval,
      status: sub.status,
      currentPeriodEnd: sub.current_period_end,
      renewsAt: sub.renews_at,
      endsAt: sub.ends_at,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
    portalUrl,
    monthlyCredits: balances?.monthly ?? null,
    purchasedCredits: balances?.purchased ?? null,
  });
}
