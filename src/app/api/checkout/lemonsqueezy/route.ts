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
  if (!email) {
    const session = await getSession();
    if (session) {
      const user = await getUserById(session.userId);
      email = user?.email ?? "";
    }
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
