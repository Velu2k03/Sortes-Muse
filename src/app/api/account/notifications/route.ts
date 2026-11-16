import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserById, setWinbackOptedOut } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Batch 5.3: the account notifications preference (win-back emails).
 *
 * GET  /api/account/notifications -> { winbackOptedOut: boolean }
 * PATCH /api/account/notifications { winbackOptedOut: boolean } -> { winbackOptedOut: boolean }
 *
 * Both require a signed-in session. The toggle on the account page
 * reads and writes this. The win-back cron excludes opted-out users
 * (see getWinbackCandidates), and the one-click unsubscribe link
 * writes the same flag.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await getUserById(session.userId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ winbackOptedOut: user.winback_opted_out ?? false });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.winbackOptedOut !== "boolean") {
    return NextResponse.json({ error: "winbackOptedOut must be a boolean." }, { status: 400 });
  }
  const user = await getUserById(session.userId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await setWinbackOptedOut(session.userId, body.winbackOptedOut);
  return NextResponse.json({ winbackOptedOut: body.winbackOptedOut });
}
