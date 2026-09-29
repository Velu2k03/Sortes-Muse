import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createCheckout, lemonConfigured } from "@/lib/lemonsqueezy";
import { getUserById } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Creates a real Lemon Squeezy checkout. 503 when not configured (client falls back to demo). */
export async function POST(req: NextRequest) {
  if (!lemonConfigured()) {
    return NextResponse.json({ error: "Checkout not configured." }, { status: 503 });
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
    return NextResponse.json({ url });
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
