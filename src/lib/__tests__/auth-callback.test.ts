import { describe, it, expect } from "vitest";
import {
  authErrorMessage,
  isMissingVerifier,
  isSignInOtpType,
  reasonFromSupabaseError,
} from "@/lib/auth-callback";

describe("auth-callback helpers (brutal audit F2)", () => {
  it("accepts only sign-in OTP types", () => {
    for (const t of ["email", "magiclink", "signup", "invite"]) expect(isSignInOtpType(t)).toBe(true);
    for (const t of ["recovery", "email_change", "sms", ""]) expect(isSignInOtpType(t)).toBe(false);
  });

  it("maps Supabase error params to fixed reasons", () => {
    expect(reasonFromSupabaseError("otp_expired", "Email link is invalid or has expired")).toBe("expired");
    expect(reasonFromSupabaseError(null, "Unable to exchange external code: 4/0Ab")).toBe("provider");
    expect(reasonFromSupabaseError("bad_oauth_state", null)).toBe("provider");
    expect(reasonFromSupabaseError(null, null)).toBe("invalid");
  });

  it("detects a missing PKCE verifier", () => {
    expect(isMissingVerifier({ code: "flow_state_not_found", message: "x" })).toBe(true);
    expect(isMissingVerifier({ message: "both auth code and code verifier should be non-empty" })).toBe(true);
    expect(isMissingVerifier({ message: "something else" })).toBe(false);
  });

  it("never reflects unknown reasons, falls back to a generic message", () => {
    expect(authErrorMessage("<script>")).toMatch(/did not work/);
    expect(authErrorMessage("unavailable")).toMatch(/temporarily unavailable/);
    expect(authErrorMessage("other-browser")).toMatch(/different browser/);
  });
});
