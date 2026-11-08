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
import {
  type AuthFailReason,
  isMissingVerifier,
  isSignInOtpType,
  reasonFromSupabaseError,
} from "@/lib/auth-callback";

export const dynamic = "force-dynamic";

/**
 * Auth callback. Brutal audit F2 (2026-11-08): accepts BOTH link shapes.
 *   - token_hash + type: verifyOtp. Works in any browser or device,
 *     because it needs no PKCE verifier cookie.
 *   - code: exchangeCodeForSession (PKCE). Only works in the browser
 *     that requested the link (the verifier cookie lives there).
 *     Google OAuth always returns this way.
 * Then bridges to a Sortes session and redirects to /account?auth=ok.
 * Every failure lands on /account?auth=error&reason=<code> so the page
 * says what went wrong instead of silently showing the signed-out form.
 */
export async function GET(req: NextRequest) {
  // Use the request origin, not the hardcoded canonical domain, so the
  // session cookie is set on the same domain the visitor started on.
  const base = req.nextUrl.origin || SITE_URL.replace(/\/$/, "");
  const fail = (reason: AuthFailReason) =>
    NextResponse.redirect(`${base}/account?auth=error&reason=${reason}`);
  const params = req.nextUrl.searchParams;

  // Supabase itself failed (expired link, Google exchange failure) and
  // redirected here with error params instead of a code.
  if (params.get("error") || params.get("error_code")) {
    const errorCode = params.get("error_code");
    const description = params.get("error_description");
    console.error(
      "auth callback: Supabase returned an error:",
      errorCode ?? params.get("error") ?? "",
      description ?? ""
    );
    return fail(reasonFromSupabaseError(errorCode, description));
  }

  if (!authConfigured()) return fail("unavailable");

  const tokenHash = params.get("token_hash");
  const code = params.get("code");
  if (!tokenHash && !code) return fail("invalid");

  let email: string | null = null;
  try {
    const supabase = await getSupabaseServer();
    if (!supabase) return fail("unavailable");
    if (tokenHash) {
      const type = params.get("type") ?? "email";
      if (!isSignInOtpType(type)) return fail("invalid");
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (error) {
        console.error("auth callback verifyOtp failed:", error.message, error.code ?? "");
        return fail(error.code === "otp_expired" ? "expired" : "invalid");
      }
      email = data.user?.email ?? null;
    } else if (code) {
      // PKCE flow id: signInWithOtp and signInWithOAuth append
      // `sb_flow_id` to the callback URL; the exchange needs it to find
      // the flow-specific verifier cookie.
      const flowId = params.get("sb_flow_id");
      const { data, error } = await supabase.auth.exchangeCodeForSession(
        code,
        flowId ? { flowId } : undefined
      );
      if (error) {
        console.error("auth callback exchange failed:", error.message, error.code ?? "");
        return fail(isMissingVerifier(error) ? "other-browser" : "invalid");
      }
      email = data.user?.email ?? null;
    }
  } catch (err) {
    console.error("auth callback: Supabase call threw:", err);
    return fail("unavailable");
  }

  if (!email) {
    console.error("auth callback: no user email in Supabase session");
    return fail("invalid");
  }

  try {
    const normalized = email.trim().toLowerCase();
    const user = (await getUserByEmail(normalized)) ?? (await createUser(normalized));
    // Phase B (R5): pass the user's current session version so a
    // link sign-in after a password change issues a live token.
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
    // Supabase sign-in succeeded but the Sortes database did not
    // answer (db-timeout class). Say "unavailable", not "bad link".
    console.error("auth callback: Sortes session bridge failed:", err);
    return fail("unavailable");
  }
}
