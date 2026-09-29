import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/db";
import {
  verifyPassword,
  createSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

// Light rate limit: 10 login attempts per email per 15 minutes (best effort).
const attempts = new Map<string, number[]>();

export async function POST(req: NextRequest) {
  try {
    let body: { email?: string; password?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";

    const now = Date.now();
    const stamps = (attempts.get(email) ?? []).filter((t) => now - t < 15 * 60_000);
    if (stamps.length >= 10) {
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
      attempts.set(email, [...stamps, now]);
      return NextResponse.json(
        { error: "Email or password is not correct." },
        { status: 401 }
      );
    }

    attempts.delete(email);
    const token = await createSession(user.id, user.email);
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
