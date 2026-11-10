import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listTransactions } from "@/lib/db";
import { checkRateLimit, clientIp, rateLimitExceeded, RATE_LIMITS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await checkRateLimit(`transactions:${clientIp(req)}`, RATE_LIMITS.moneyIp)).allowed) {
    return rateLimitExceeded();
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const transactions = await listTransactions(session.userId);
  return NextResponse.json({ transactions });
}
