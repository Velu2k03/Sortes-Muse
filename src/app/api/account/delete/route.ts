import { NextRequest, NextResponse } from "next/server";
import {
  getSession,
  SESSION_COOKIE,
  verifyPassword,
  hashCode,
  codesMatch,
} from "@/lib/auth";
import {
  deleteUser,
  getUserById,
  getAuthCode,
  deleteAuthCode,
  bumpAuthCodeAttempts,
} from "@/lib/db";
import { checkRateLimit, rateLimitExceeded, RATE_LIMITS } from "@/lib/rateLimit";

// Phase 3 (3.6): self-serve account deletion. Destructive and
// final: deleteUser removes the user row and every dependent row
// (readings, reports, transactions, free-use records, auth codes)
// in one transaction. The session cookie is cleared here, and the
// client also signs out of Supabase and clears the device copies
// of the same data.
//
// Phase 6 (N4): a session cookie alone is no longer enough. The
// caller must re-authenticate with the account password, or with a
// fresh 6-digit email code (request one from the account page; the
// code is the Resend-path code, same as sign-in). Sessions are
// 30-day JWTs with no revocation, so a stolen cookie used to mean
// instant irreversible deletion; now it only gets as far as this
// re-auth check. The code is single-use: a successful delete
// consumes it, a failed attempt counts toward the 5-attempt limit.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function verifyReAuth(
  user: { id: string; email: string; password_hash?: string | null },
  body: { password?: unknown; code?: unknown }
): Promise<{ ok: boolean; error?: string }> {
  // Phase 6B: supplying both used to silently prefer the password
  // and leave the code unconsumed. Reject the ambiguous request.
  // Typed locals (not just booleans) so the branches below keep
  // TypeScript narrowing on body.password / body.code.
  const password = typeof body.password === "string" ? body.password : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const hasPassword = password.length > 0;
  const hasCode = code.length > 0;
  if (hasPassword && hasCode) {
    return { ok: false, error: "Provide either your password or a sign-in code, not both." };
  }
  if (hasPassword) {
    if (!user.password_hash) {
      return { ok: false, error: "This account has no password set. Request a sign-in code instead, or set a password first." };
    }
    const ok = await verifyPassword(password, user.password_hash);
    return ok
      ? { ok: true }
      : { ok: false, error: "That password is not correct." };
  }
  if (hasCode) {
    if (!/^\d{6}$/.test(code)) {
      return { ok: false, error: "That code must be 6 digits." };
    }
    const record = await getAuthCode(user.email);
    if (!record) {
      return { ok: false, error: "No code was requested for this email. Request a fresh code first." };
    }
    if (record.attempts >= 5) {
      await deleteAuthCode(user.email);
      return { ok: false, error: "Too many attempts. Request a fresh code." };
    }
    if (Date.parse(record.expires_at) < Date.now()) {
      await deleteAuthCode(user.email);
      return { ok: false, error: "That code expired. Request a fresh code." };
    }
    if (!codesMatch(hashCode(code), record.code_hash)) {
      await bumpAuthCodeAttempts(user.email);
      return { ok: false, error: "That code is not correct. Try again." };
    }
    await deleteAuthCode(user.email);
    return { ok: true };
  }
  return {
    ok: false,
    error: "To delete your account, confirm with your password or a fresh sign-in code.",
  };
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  // Phase 6 (N3): account deletion was unrated. 3/hour per user.
  if (!checkRateLimit(`delete:${session.userId}`, RATE_LIMITS.accountDeleteUser).allowed) {
    return rateLimitExceeded();
  }
  const user = await getUserById(session.userId);
  if (!user) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  let body: { password?: unknown; code?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const reAuth = await verifyReAuth(user, body);
  if (!reAuth.ok) {
    return NextResponse.json({ error: reAuth.error }, { status: 401 });
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
