import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/db";
import {
  verifyPassword,
  createSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  authConfigured,} from "@/lib/auth";
import { isRateLimited, recordRateLimit, clientIp, emailLimitKey, RATE_LIMITS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let body: { email?: string; password?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    if (!authConfigured()) {
      return NextResponse.json(
        { error: "Sign-in is not configured on this server yet. Please try again later." },
        { status: 503 }
      );
    }
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";

    // 10 failed logins per email per 15 minutes (best effort, shared
    // limiter). Only failures count, as before; a success does not
    // consume the budget.
    const limitKey = emailLimitKey("login", email);
    if (await isRateLimited(limitKey, RATE_LIMITS.loginEmail)) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again in a few minutes." },
        { status: 429 }
      );
    }
    // Phase B (R12): 30 failed logins per IP per 15 minutes, in
    // addition to the per-email limit, so rotating target emails
    // from one IP does not bypass the limit. Checked before the
    // password verification, recorded only on failure.
    const ipKey = `login-ip:${clientIp(req)}`;
    if (await isRateLimited(ipKey, RATE_LIMITS.loginIp)) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again in a few minutes." },
        { status: 429 }
      );
    }

    const user = await getUserByEmail(email);
    const ok =
      user?.password_hash &&
      (await verifyPassword(password, user.password_hash));
    if (!ok) {
      await recordRateLimit(limitKey, RATE_LIMITS.loginEmail);
      await recordRateLimit(ipKey, RATE_LIMITS.loginIp);
      return NextResponse.json(
        { error: "Email or password is not correct." },
        { status: 401 }
      );
    }

    const token = await createSession(user.id, user.email, user.pwd_ver ?? 1);
    const res = NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email, credits: user.credits },
    });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch (err) {
    console.error("login failed:", err);
    return NextResponse.json(
      { error: "Sign-in is temporarily unavailable. Please try again in a moment." },
      { status: 500 }
    );
  }
}
