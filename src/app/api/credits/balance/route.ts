import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserById } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Read-only Oracle balance for the signed-in user.
 *
 * Phase B (R15): the POST handler is deleted. It used to let a
 * signed-in client spend its own credits, but no UI path uses it
 * for signed-in users any more: the AI routes spend server-side
 * after a real generation, and the three AuthProvider.spend callers
 * (IntakeFlow, ReadingDetailClient, ChartsClient) only ever call
 * spend() for guests, whose spend never reaches the API. The
 * endpoint could only drain the caller's own balance (self-harm),
 * but it was dead surface that contradicted the "credits may only
 * be granted or spent server-side" story, so it is gone rather than
 * restricted. AuthProvider.spend/add are guest-local-storage only
 * now. Any future server-side spend need must go through the AI
 * routes or a new explicitly-scoped endpoint, not a revival of
 * this handler.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const user = await getUserById(session.userId);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ credits: user.credits });
}
