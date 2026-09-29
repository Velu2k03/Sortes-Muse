import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserById, addUserCredits } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * One-time merge after sign-in: move the guest wallet's local credits into the
 * user's database balance. Body: { localCredits: number }.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  let body: { localCredits?: number };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const local = Math.max(0, Math.trunc(Number(body.localCredits ?? 0)));
  if (local > 0) {
    await addUserCredits(session.userId, local);
  }
  const user = await getUserById(session.userId);
  return NextResponse.json({ credits: user?.credits ?? 0 });
}
