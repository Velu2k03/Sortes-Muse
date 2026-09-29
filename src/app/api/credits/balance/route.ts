import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserById, addUserCredits, spendUserCredits } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const user = await getUserById(session.userId);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ credits: user.credits });
}

/**
 * Spend or add credits server-side. Body: { delta: number } (negative = spend).
 * Returns the new balance.
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
  if (delta < 0) {
    const ok = await spendUserCredits(session.userId, -delta);
    if (!ok) return NextResponse.json({ error: "Insufficient credits." }, { status: 402 });
    const user = await getUserById(session.userId);
    return NextResponse.json({ credits: user?.credits ?? 0 });
  }
  const credits = await addUserCredits(session.userId, delta);
  return NextResponse.json({ credits });
}
