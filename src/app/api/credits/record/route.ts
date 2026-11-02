import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createTransaction, addUserCredits, getUserById } from "@/lib/db";
import { lemonConfigured } from "@/lib/lemonsqueezy";

export const dynamic = "force-dynamic";

/**
 * Records a demo-checkout purchase (Phase 7). Creates a transaction row and
 * grants the credits. Phase 8's Lemon Squeezy webhook replaces this with
 * real, verified purchases.
 *
 * M0.1 credit authority: demo grants are only available while no real
 * payment provider is configured. Once Lemon Squeezy is configured, the
 * client offers real checkout instead, and this endpoint refuses grants,
 * because an ungated grant endpoint would let any signed-in session mint
 * credits even with a live payment provider.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (lemonConfigured()) {
    return NextResponse.json(
      { error: "Real checkout is configured. Demo grants are disabled." },
      { status: 503 }
    );
  }

  let body: { packId?: string; readings?: number; price?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const readings = Math.trunc(Number(body.readings ?? 0));
  const price = Number(body.price ?? 0);
  const packId = String(body.packId ?? "unknown").slice(0, 40);
  if (![5, 12, 30].includes(readings) || !(price > 0) || price > 100) {
    return NextResponse.json({ error: "Invalid pack." }, { status: 400 });
  }

  await createTransaction({
    userId: session.userId,
    email: session.email,
    packType: `${packId} (demo)`,
    amount: price,
    readings,
  });
  const credits = await addUserCredits(session.userId, readings);
  const user = await getUserById(session.userId);
  return NextResponse.json({ ok: true, credits, email: user?.email });
}
