import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Brutal audit F2 (2026-11-08): shared pieces of the /auth/callback
 * route and the /account error banner.
 *
 * Sign-in link types accepted by the callback. The first link Supabase
 * sends a new address is a Confirm-signup link (type=signup); later
 * links are magiclink. Both are sign-in. "email" is the current
 * umbrella type in auth-js (EmailOtpType in @supabase/auth-js
 * lib/types.d.ts). recovery and email_change are not sign-in.
 */
export const SIGN_IN_OTP_TYPES: readonly EmailOtpType[] = ["email", "magiclink", "signup", "invite"];

export function isSignInOtpType(type: string): type is EmailOtpType {
  return (SIGN_IN_OTP_TYPES as readonly string[]).includes(type);
}

/**
 * Short, fixed reason codes for /account?auth=error&reason=…. Raw
 * provider text is logged server-side, never reflected into the page.
 */
export const AUTH_FAIL_REASONS = ["expired", "other-browser", "provider", "unavailable", "invalid"] as const;
export type AuthFailReason = (typeof AUTH_FAIL_REASONS)[number];

/** Map Supabase's ?error_code=…&error_description=… to a reason. */
export function reasonFromSupabaseError(
  errorCode: string | null,
  description: string | null
): AuthFailReason {
  const code = (errorCode ?? "").toLowerCase();
  const desc = (description ?? "").toLowerCase();
  if (code === "otp_expired" || desc.includes("expired")) return "expired";
  // "Unable to exchange external code" = the Google leg failed inside
  // Supabase (provider credentials), before this app saw any code.
  if (
    desc.includes("external code") ||
    code === "bad_oauth_callback" ||
    code === "bad_oauth_state" ||
    code === "unexpected_failure"
  ) {
    return "provider";
  }
  return "invalid";
}

/** True when a PKCE exchange failed because this browser has no verifier. */
export function isMissingVerifier(err: { code?: string; message: string }): boolean {
  return err.code === "flow_state_not_found" || /code verifier|flow state/i.test(err.message);
}

/** The /account banner text for each reason. Unknown -> generic. */
export function authErrorMessage(reason: string | null): string {
  switch (reason) {
    case "expired":
      return "That sign-in link has expired or was already used. Request a new link below.";
    case "other-browser":
      return "That sign-in link was opened in a different browser from the one that requested it. Request a new link and open it here, or sign in with your password.";
    case "provider":
      return "Google sign-in did not complete. Please try again, or sign in with an email link or password.";
    case "unavailable":
      return "Sign-in is temporarily unavailable. Please try again in a moment.";
    default:
      return "That sign-in link did not work. Request a new link below, or sign in with your password.";
  }
}
