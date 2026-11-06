import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createCheckout, lemonConfigured } from "@/lib/lemonsqueezy";
import { getUserById } from "@/lib/db";
import { checkRateLimit, clientIp, rateLimitExceeded, RATE_LIMITS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/** Creates a real Lemon Squeezy checkout. 503 when not configured. */
export async function POST(req: NextRequest) {
  if (!lemonConfigured()) {
    return NextResponse.json({ error: "Checkout not configured." }, { status: 503 });
  }
  if (!checkRateLimit(`checkout:${clientIp(req)}`, RATE_LIMITS.checkoutIp).allowed) {
    return rateLimitExceeded();
  }
  let body: { packId?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const packId = body.packId ?? "";
  if (!["pack5", "pack12", "pack30"].includes(packId)) {
    return NextResponse.json({ error: "Invalid pack." }, { status: 400 });
  }

  // Phase G follow-up (F1): when a session exists, the session email
  // is the buyer and body.email is ignored. Letting a signed-in user
  // supply an arbitrary body.email pre-created a passwordless account
  // for that address and forced its owner into the OTP path (a 409
  // on password signup). Guests have no session, so body.email is
  // their only address and is kept.
  const session = await getSession();
  let email = "";
  if (session) {
    const user = await getUserById(session.userId);
    email = user?.email ?? "";
  } else {
    email = (body.email ?? "").trim();
  }
  // Guests must supply an email: the webhook delivers credits to that
  // address and it becomes their account on sign-in.
  if (!email) {
    return NextResponse.json(
      { error: "An email is required so your Oracles reach your account." },
      { status: 400 }
    );
  }

  try {
    const url = await createCheckout({ packId, email: email || undefined });
    // Phase 6: no claim nonce is created here. The post-payment claim
    // endpoint (/api/checkout/claim) was deleted — it had no client
    // callers, and PurchaseConfirmer polls the balance instead. The
    // webhook grants credits to the checkout email, and the buyer
    // signs in with that email (OTP) to see them.
    return NextResponse.json({ url });
  } catch (err) {
    console.error(
      JSON.stringify({
        source: "sortes-lemonsqueezy",
        event: "checkout-route-error",
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
  return NextResponse.json({ enabled: lemonConfigured() });
}
