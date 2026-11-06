import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getUserByEmail, createUser } from "@/lib/db";
import {
  createSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  authConfigured,
} from "@/lib/auth";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Magic-link callback. Supabase returns here with a code, the server
 * exchanges it for a Supabase session, then bridges to a Sortes
 * session exactly like the OTP bridge, and redirects to /account.
 * If anything fails, the user lands on /account with an error flag
 * instead of a broken page, and can retry with the magic-link flow.
 */
export async function GET(req: NextRequest) {
  // Use the request origin, not the hardcoded canonical domain, so the
  // session cookie is set on the same domain the visitor started on.
  // Falls back to SITE_URL only if the request has no origin.
  const base = req.nextUrl.origin || SITE_URL.replace(/\/$/, "");
  const fail = NextResponse.redirect(`${base}/account?auth=error`);
  try {
    if (!authConfigured()) return fail;
    const code = req.nextUrl.searchParams.get("code");
    if (!code) return fail;
    const supabase = await getSupabaseServer();
    if (!supabase) return fail;
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user?.email) return fail;
    const email = data.user.email.trim().toLowerCase();
    const user = (await getUserByEmail(email)) ?? (await createUser(email));
    // Phase B (R5): pass the user's current session version so a
    // magic-link sign-in after a password change issues a live token
    // instead of one that getSession rejects on version mismatch.
    const token = await createSession(user.id, user.email, user.pwd_ver ?? 1);
    const res = NextResponse.redirect(`${base}/account?auth=ok`);
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch (err) {
    console.error("auth callback failed:", err);
    return fail;
  }
}
