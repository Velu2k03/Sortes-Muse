import { NextRequest, NextResponse } from "next/server";
import { countRecentReadings } from "@/lib/db";
import { checkRateLimit, clientIp, ipLimitKey, rateLimitExceeded, RATE_LIMITS } from "@/lib/rateLimit";

/**
 * Public social-proof stat: readings cast in the last 7 days.
 * Cached in memory for 10 minutes; never fails the page.
 */
let cache: { at: number; value: number } | null = null;

export async function GET(req: NextRequest) {
  // Phase 6 (N3): the public stats endpoint was unrated. 60/min/IP.
  if (!(await checkRateLimit(ipLimitKey("stats", clientIp(req)), RATE_LIMITS.readIp)).allowed) {
    return rateLimitExceeded();
  }
  const now = Date.now();
  if (cache && now - cache.at < 10 * 60 * 1000) {
    return NextResponse.json({ readingsThisWeek: cache.value });
  }
  try {
    const value = await countRecentReadings(7);
    cache = { at: now, value };
    return NextResponse.json({ readingsThisWeek: value });
  } catch {
    return NextResponse.json({ readingsThisWeek: 0 });
  }
}
