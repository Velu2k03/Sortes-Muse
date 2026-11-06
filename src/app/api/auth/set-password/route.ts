import { NextRequest, NextResponse } from "next/server";
import { getUserById, setUserPassword } from "@/lib/db";
import {
  getSession,
  hashPassword,
  verifyPassword,
  createSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitExceeded, RATE_LIMITS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/** Signed-in users can set a password (or change it with the current one). */
export async function POST(req: NextRequest) {
  if (!checkRateLimit(`setpw:${clientIp(req)}`, RATE_LIMITS.authIp).allowed) {
    return rateLimitExceeded();
  }
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }
    let body: { password?: string; currentPassword?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const password = body.password ?? "";
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }
    const user = await getUserById(session.userId);
    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }
    if (user.password_hash) {
      const ok = await verifyPassword(
        body.currentPassword ?? "",
        user.password_hash
      );
      if (!ok) {
        return NextResponse.json(
          { error: "Current password is not correct." },
          { status: 401 }
        );
      }
    }
    // Phase B (R5): setUserPassword bumps the session version in the
    // same statement, so every token issued before this change is
    // dead from the next request on. The device that changed the
    // password gets a fresh session with the new version, so it
    // stays signed in; every other device (and any stolen token)
    // is signed out. Logout itself stays cookie-clear only.
    const newVersion = await setUserPassword(user.id, await hashPassword(password));
    const token = await createSession(user.id, user.email, newVersion);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch (err) {
    console.error("set-password failed:", err);
    return NextResponse.json(
      { error: "Could not save the password. Please try again in a moment." },
      { status: 500 }
    );
  }
}
