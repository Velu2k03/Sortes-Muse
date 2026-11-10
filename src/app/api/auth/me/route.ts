import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserById, hasUsedFreeReading } from "@/lib/db";
import { checkRateLimit, clientIp, ipLimitKey, rateLimitExceeded, RATE_LIMITS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // AF-005: the session read is called on every page load and had no
  // limit at all. The generous shared readIp bucket (60/min/IP)
  // bounds unauthenticated polling without touching normal use; a
  // tripped limit reads as signed-out in AuthProvider until the next
  // refresh, same as any other non-200 here.
  if (!(await checkRateLimit(ipLimitKey("me", clientIp(req)), RATE_LIMITS.readIp)).allowed) {
    return rateLimitExceeded();
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null });
  const user = await getUserById(session.userId);
  if (!user) return NextResponse.json({ user: null });
  // Batch 1 (C1): the UI used to decide "free" from a per-device flag,
  // while the server decides from the account record. A signed-in user
  // whose device flag was clear but whose account already used the free
  // reading saw "Cost: Free" and was then charged 1 Oracle. The account
  // record is returned here so the client labels from the same source
  // the generate route spends from.
  // Review fix: the lookup is guarded. If it throws or times out, the
  // field is omitted instead of failing /me, which would sign the user
  // out over a free-flag lookup. The client maps a missing value to
  // null and fails closed on the label.
  let freeReadingAvailable: boolean | undefined;
  try {
    freeReadingAvailable = !(await hasUsedFreeReading(session.userId));
  } catch {
    freeReadingAvailable = undefined;
  }
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      credits: user.credits,
      ...(freeReadingAvailable !== undefined ? { freeReadingAvailable } : {}),
    },
  });
}
