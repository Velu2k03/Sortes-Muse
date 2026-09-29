import { NextRequest, NextResponse } from "next/server";
import { getOrder, lemonConfigured } from "@/lib/lemonsqueezy";
import { getUserByEmail, createUser } from "@/lib/db";
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Post-payment claim: after a guest completes Lemon Squeezy checkout they are
 * redirected back with the order id. This verifies the order is paid via the
 * Lemon Squeezy API, auto-creates (or finds) the account from the buyer's
 * email, and signs them in — no password, no extra steps.
 */
export async function POST(req: NextRequest) {
  if (!lemonConfigured()) {
    return NextResponse.json({ error: "Checkout not configured." }, { status: 503 });
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
  return res;
}
