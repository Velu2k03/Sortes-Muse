import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createCheckout, lemonConfigured, CHECKOUT_NONCE_COOKIE, CHECKOUT_NONCE_MAX_AGE } from "@/lib/lemonsqueezy";
import { getUserById, createCheckoutNonce } from "@/lib/db";
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

  // Prefer the signed-in user's email; guests may type theirs (email-only checkout).
  let email = (body.email ?? "").trim();
  const session = await getSession();
  if (!email && session) {
    const user = await getUserById(session.userId);
    email = user?.email ?? "";
  }
  // Guests must supply an email: the webhook delivers credits to that
  // address and it becomes their account on sign-in.
  if (!email) {
    return NextResponse.json(
      { error: "An email is required so your credits reach your account." },
      { status: 400 }
    );
  }

  try {
    const url = await createCheckout({ packId, email: email || undefined });
    const res = NextResponse.json({ url });
    // Phase 1 (1.3): bind the post-payment claim to this browser.
    // The nonce is stored server-side and in an httpOnly cookie; the
    // claim route consumes it once, so a paid order id alone can no
    // longer claim someone else's purchase.
    const nonce = await createCheckoutNonce(email, packId);
    res.cookies.set(CHECKOUT_NONCE_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: CHECKOUT_NONCE_MAX_AGE,
    });
    return res;
  } catch {
    return NextResponse.json(
      { error: "Could not start checkout. Please try again." },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ enabled: lemonConfigured() });
}
