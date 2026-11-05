import { NextRequest, NextResponse } from "next/server";
import { getOrder, lemonConfigured, CHECKOUT_NONCE_COOKIE } from "@/lib/lemonsqueezy";
import { getUserByEmail, createUser, consumeCheckoutNonce } from "@/lib/db";
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitExceeded, RATE_LIMITS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Post-payment claim: after a guest completes Lemon Squeezy checkout they are
 * redirected back with the order id. This verifies the order is paid via the
 * Lemon Squeezy API, auto-creates (or finds) the account from the buyer's
 * email, and signs them in — no password, no extra steps.
 *
 * Phase 1 (1.3): the claim is bound to the nonce created when this
 * browser started the checkout (httpOnly cookie + server-side row).
 * The nonce is single-use and must match the order's buyer email, so
 * knowing a paid order id alone no longer signs the caller in as the
 * buyer. The nonce is only consumed AFTER the order is verified paid,
 * so a failed claim (unpaid order, wrong id) does not burn it.
 */
export async function POST(req: NextRequest) {
  if (!lemonConfigured()) {
    return NextResponse.json({ error: "Checkout not configured." }, { status: 503 });
  }
  if (!checkRateLimit(`claim:${clientIp(req)}`, RATE_LIMITS.claimIp).allowed) {
    return rateLimitExceeded();
  }
  const nonce = req.cookies.get(CHECKOUT_NONCE_COOKIE)?.value;
  if (!nonce) {
    return NextResponse.json(
      { error: "This purchase cannot be claimed from this browser. Please sign in with your purchase email instead." },
      { status: 403 }
    );
  }
  let body: { order_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const orderId = String(body.order_id ?? "").trim();
  if (!orderId) return NextResponse.json({ error: "Missing order id." }, { status: 400 });

  const order = await getOrder(orderId);
  const attrs = order?.data?.attributes;
  const email = (attrs?.user_email ?? "").trim().toLowerCase();
  const paid = attrs?.status === "paid";
  if (!order || !paid || !email) {
    return NextResponse.json(
      { error: "Order not found or not paid yet." },
      { status: 400 }
    );
  }

  if (!(await consumeCheckoutNonce(nonce, email))) {
    return NextResponse.json(
      { error: "This purchase link has already been used or expired. Please sign in with your purchase email instead." },
      { status: 403 }
    );
  }

  const user = (await getUserByEmail(email)) ?? (await createUser(email));
  const token = await createSession(user.id, user.email);
  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, credits: user.credits },
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  // Nonce is spent; clear the cookie so a stale value is never resent.
  res.cookies.set(CHECKOUT_NONCE_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
