import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Bug 2 (2026-11-07): magic-link email redirected to the site root
// instead of /auth/callback. The code was already correct: the
// signInWithOtp call passes the visitor's origin + /auth/callback as
// emailRedirectTo, and the failure was the Supabase Redirect URLs
// allow list (dashboard config, not code). This test pins the code
// side so a later edit cannot silently drop the redirect: it reads
// the component source, the same way home-comprehension pins copy
// elsewhere in this repo. The dashboard side is specced in
// hidden_files/bug2-redirect-allowlist-spec.md.

const src = readFileSync(
  path.resolve(process.cwd(), "src/app/account/AccountClient.tsx"),
  "utf8"
).replace(/\s+/g, " ");

describe("AccountClient magic-link redirect", () => {
  it("passes the visitor origin + /auth/callback as emailRedirectTo", () => {
    expect(src).toContain(
      "emailRedirectTo: `${window.location.origin}/auth/callback`"
    );
  });

  it("has exactly one email-link entry point, and it is the pinned one", () => {
    const signInWithOtp = src.match(/signInWithOtp/g) ?? [];
    expect(signInWithOtp).toHaveLength(1);
    expect(src).toContain("supabase.auth.signInWithOtp");
  });

  it("sends no other Supabase email-link flow from this component", () => {
    expect(src).not.toContain("resetPasswordForEmail");
    expect(src).not.toContain("signInWithOAuth");
    expect(src).not.toContain("inviteUserByEmail");
  });
});
