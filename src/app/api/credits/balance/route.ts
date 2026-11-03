import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserById, spendUserCredits } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const user = await getUserById(session.userId);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ credits: user.credits });
}

/**
 * Spend credits server-side. Body: { delta: number } (negative = spend).
 * Returns the new balance.
 *
 * M0.1 credit authority: positive deltas are rejected. Credits may only
 * be granted by server events (purchase webhook fulfillment, verified
 * claim, server-side refund inside an AI route), never by a client
 * request, because any signed-in session could otherwise mint credits.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  let body: { delta?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const delta = Math.trunc(Number(body.delta ?? 0));
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 1000) {
    return NextResponse.json({ error: "Invalid amount." }, { status: 400 });
  }
  if (delta > 0) {
    return NextResponse.json(
      { error: "Credits can only be granted by the server (purchases and refunds). Client grants are not accepted." },
      { status: 400 }
    );
  }
  const ok = await spendUserCredits(session.userId, -delta);
  if (!ok) return NextResponse.json({ error: "Insufficient credits." }, { status: 402 });
  const user = await getUserById(session.userId);
  return NextResponse.json({ credits: user?.credits ?? 0 });
}
