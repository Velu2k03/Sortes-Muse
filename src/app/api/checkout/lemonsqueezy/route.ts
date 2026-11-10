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
  if (!(await checkRateLimit(`checkout:${clientIp(req)}`, RATE_LIMITS.checkoutIp)).allowed) {
    return rateLimitExceeded();
  }
  let body: { packId?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  // A JSON body of null or a primitive would throw on property access
  // below and produce an empty-body 500 (F1). Reject it as JSON.
  if (!body || typeof body !== "object") {
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
  // Brutal audit F1 (2026-11-08): getSession() and getUserById() hit
  // the database and were outside any try/catch. When the database did
  // not answer, the handler threw and Next sent a 500 with an EMPTY
  // body, which the checkout modal surfaced as "Failed to execute
  // 'json' on 'Response': Unexpected end of JSON input". This route now
  // always answers with JSON and a readable error.
  let session: Awaited<ReturnType<typeof getSession>>;
  let email = "";
  try {
    session = await getSession();
    if (session) {
      const user = await getUserById(session.userId);
      email = user?.email ?? "";
    } else {
      email = (body.email ?? "").trim();
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        source: "sortes-lemonsqueezy",
        event: "checkout-session-lookup-failed",
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return NextResponse.json(
      { error: "Checkout is temporarily unavailable. Please try again in a moment." },
      { status: 503 }
    );
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
    // Bug 1 fix: bind the checkout to the signed-in account. The
    // user id travels in checkout_data.custom (see createCheckout)
    // so the webhook credits the signed-in account even when Lemon
    // Squeezy reports the Link account's email. Guests pass none
    // and keep the email-only path.
    const url = await createCheckout({
      packId,
      email: email || undefined,
      ...(session ? { userId: session.userId } : {}),
    });
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
