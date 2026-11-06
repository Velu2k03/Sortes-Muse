import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail, createUserWithPassword } from "@/lib/db";
import {
  hashPassword,
  createSession,
  isValidEmail,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  authConfigured,} from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitExceeded, RATE_LIMITS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

function signInResponse(user: { id: string; email: string; credits: number; pwd_ver?: number | null }) {
  return createSession(user.id, user.email, user.pwd_ver ?? 1).then((token) => {
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
  });
}

export async function POST(req: NextRequest) {
  if (!checkRateLimit(`signup:${clientIp(req)}`, RATE_LIMITS.authIp).allowed) {
    return rateLimitExceeded();
  }
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
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    // Any existing account — with or without a password — is a 409.
    // The old code only rejected accounts that already had a password,
    // so anyone could set a password on a passwordless account (created
    // by OTP sign-in or the purchase webhook) and take it over.
    // Setting a password on an existing account now requires proving
    // the email first: request an OTP code, verify it (which signs
    // in), then use the signed-in set-password route.
    const existing = await getUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "This email already has an account. Please sign in instead." },
        { status: 409 }
      );
    }
    const user = await createUserWithPassword(email, await hashPassword(password));
    if (!user) {
      // Lost a race with another signup for the same email.
      return NextResponse.json(
        { error: "This email already has an account. Please sign in instead." },
        { status: 409 }
      );
    }
    return await signInResponse(user);
  } catch (err) {
    console.error("signup failed:", err);
    return NextResponse.json(
      { error: "Sign-up is temporarily unavailable. Please try again in a moment." },
      { status: 500 }
    );
  }
}
