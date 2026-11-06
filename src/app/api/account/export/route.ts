import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getUserById,
  listTransactions,
  listReadingsForUser,
  listReportsForUser,
} from "@/lib/db";
import { checkRateLimit, rateLimitExceeded, RATE_LIMITS } from "@/lib/rateLimit";

// Phase 3 (3.6): self-serve export of everything the account holds:
// Oracle balance, purchase history, journal readings, and reports.
// Reuses the same list functions the journal and reports pages read
// from, so the export can never drift from what the app shows.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  // Phase 6 (N3): full-data export was unrated. 10/hour per user.
  if (!checkRateLimit(`export:${session.userId}`, RATE_LIMITS.accountExportUser).allowed) {
    return rateLimitExceeded();
  }
  const user = await getUserById(session.userId);
  if (!user) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  const [transactions, readings, reports] = await Promise.all([
    listTransactions(session.userId),
    listReadingsForUser(session.userId),
    listReportsForUser(session.userId),
  ]);
  const body = {
    exportedAt: new Date().toISOString(),
    email: user.email,
    oracleBalance: user.credits,
    transactions,
    readings,
    reports,
  };
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="sortes-data-${date}.json"`,
    },
  });
}
