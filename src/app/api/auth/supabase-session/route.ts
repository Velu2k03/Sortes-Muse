import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getUserByEmail, createUser } from "@/lib/db";
import {
  createSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  authConfigured,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Bridge from a verified Supabase session to Sortes' own session.
 * The client sends only its Supabase access token. The server asks
 * Supabase who that token belongs to, and never trusts an email
 * supplied by the client. It then creates or finds the Sortes user
 * by that verified email and sets the Sortes session cookie, so
 * guest credits and journal migration run exactly as before.
 */
export async function POST(req: NextRequest) {
  try {
    if (!authConfigured()) {
      return NextResponse.json(
        { error: "Sign-in is not configured on this server yet. Please try again later." },
        { status: 503 }
      );
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      return NextResponse.json(
        { error: "Sign-in is not configured on this server yet. Please try again later." },
        { status: 503 }
      );
    }
    let body: { accessToken?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    if (!body.accessToken) {
      return NextResponse.json({ error: "Missing session." }, { status: 400 });
    }
    const supabase = createClient(url, anon);
    const { data, error } = await supabase.auth.getUser(body.accessToken);
    if (error || !data.user?.email) {
      return NextResponse.json({ error: "That session could not be verified. Please try again." }, { status: 401 });
    }
    const email = data.user.email.trim().toLowerCase();
    const user = (await getUserByEmail(email)) ?? (await createUser(email));
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
    console.error("supabase-session failed:", err);
    return NextResponse.json(
      { error: "Sign-in is temporarily unavailable. Please try again in a moment." },
      { status: 500 }
    );
  }
}
