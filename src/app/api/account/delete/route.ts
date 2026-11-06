import { NextResponse } from "next/server";
import { getSession, SESSION_COOKIE } from "@/lib/auth";
import { deleteUser } from "@/lib/db";
import { checkRateLimit, rateLimitExceeded, RATE_LIMITS } from "@/lib/rateLimit";

// Phase 3 (3.6): self-serve account deletion. Destructive and
// final: deleteUser removes the user row and every dependent row
// (readings, reports, transactions, free-use records, auth codes)
// in one transaction. The session cookie is cleared here, and the
// client also signs out of Supabase and clears the device copies
// of the same data.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  // Phase 6 (N3): account deletion was unrated. 3/hour per user.
  if (!checkRateLimit(`delete:${session.userId}`, RATE_LIMITS.accountDeleteUser).allowed) {
    return rateLimitExceeded();
  }
  const ok = await deleteUser(session.userId);
  const res = NextResponse.json({ ok });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return res;
}
