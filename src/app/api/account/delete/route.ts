import { NextResponse } from "next/server";
import { getSession, SESSION_COOKIE } from "@/lib/auth";
import { deleteUser } from "@/lib/db";

// Phase 3 (3.6): self-serve account deletion. Destructive and
// final: deleteUser removes the user row and every dependent row
// (readings, reports, transactions, free-use records, auth codes,
// checkout nonces) in one transaction. The session cookie is cleared
// here, and the client also signs out of Supabase and clears the
// device copies of the same data.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
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
