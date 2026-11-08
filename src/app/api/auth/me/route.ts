import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserById } from "@/lib/db";
import { checkRateLimit, clientIp, rateLimitExceeded, RATE_LIMITS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // AF-005: the session read is called on every page load and had no
  // limit at all. The generous shared readIp bucket (60/min/IP)
  // bounds unauthenticated polling without touching normal use; a
  // tripped limit reads as signed-out in AuthProvider until the next
  // refresh, same as any other non-200 here.
  if (!checkRateLimit(`me:${clientIp(req)}`, RATE_LIMITS.readIp).allowed) {
    return rateLimitExceeded();
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null });
  const user = await getUserById(session.userId);
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: { id: user.id, email: user.email, credits: user.credits },
  });
}
