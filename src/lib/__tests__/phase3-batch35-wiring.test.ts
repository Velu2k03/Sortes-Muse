import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Phase 3 Batch 3.5 sign in", () => {
  const client = src("src/app/account/AccountClient.tsx");

  it("has a show-password toggle", () => {
    expect(client).toContain("showPassword");
    expect(client).toContain('type={showPassword ? "text" : "password"}');
    expect(client).toContain('aria-label={showPassword ? "Hide password" : "Show password"}');
    expect(client).toContain("aria-pressed={showPassword}");
    expect(client).toContain("{showPassword ? \"Hide\" : \"Show\"}");
  });

  it("offers an email link when the password is forgotten, with no reset route", () => {
    // There is no /api/auth/reset route; the fallback is the
    // existing email-link tab, with the email kept.
    expect(client).toContain("Forgot your password? Sign in with an email link instead");
    expect(client).toContain('setAuthTab("link")');
    expect(client).toContain('setStep("email")');
  });

  it("trims and lowercases the email before every auth call", () => {
    // The four auth calls: password login/signup, the Supabase
    // magic link, the dev code request, and the code verify.
    const hits = client.match(/email\.trim\(\)\.toLowerCase\(\)/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(4);
    // No auth call sends the raw email anymore.
    expect(client).not.toContain("JSON.stringify({ email, password })");
    expect(client).not.toContain("JSON.stringify({ email })");
    expect(client).not.toContain("JSON.stringify({ email, code })");
  });
});
