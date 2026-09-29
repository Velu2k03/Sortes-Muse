import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail, createUser } from "@/lib/db";
import {
  hashPassword,
  createSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signInResponse(user: { id: string; email: string; credits: number }) {
  return createSession(user.id, user.email).then((token) => {
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
  try {
    let body: { email?: string; password?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    if (!EMAIL_RE.test(email)) {
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

    const existing = await getUserByEmail(email);
    if (existing?.password_hash) {
      return NextResponse.json(
        { error: "This email already has an account. Please sign in instead." },
        { status: 409 }
      );
    }
    const user = await createUser(email, await hashPassword(password));
    return await signInResponse(user);
  } catch (err) {
    console.error("signup failed:", err);
    return NextResponse.json(
      { error: "Sign-up is temporarily unavailable. Please try again in a moment." },
      { status: 500 }
    );
  }
}
