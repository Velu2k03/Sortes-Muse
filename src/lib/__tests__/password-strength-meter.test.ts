/**
 * Signup password strength meter (Velu 2026-11-18). Locks the
 * pure scoring in src/lib/password-strength.ts, the rendered meter
 * in src/app/account/PasswordStrengthMeter.tsx, and its wiring in
 * the signed-out password form (signup only, the existing rules
 * untouched).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { scorePassword, STRENGTH_MAX_SCORE } from "@/lib/password-strength";
import PasswordStrengthMeter, {
  PASSWORD_STRENGTH_ID,
} from "@/app/account/PasswordStrengthMeter";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

function render(password: string): string {
  return renderToStaticMarkup(createElement(PasswordStrengthMeter, { password }));
}

describe("scorePassword", () => {
  it("an empty password scores lowest", () => {
    expect(scorePassword("")).toEqual({ score: 0, level: "Weak" });
    for (const p of ["password", "Password1", "Correct-Horse-Battery-9"]) {
      expect(scorePassword(p).score).toBeGreaterThan(scorePassword("").score);
    }
  });

  it("a short 8-character all-lowercase password is Weak", () => {
    expect(scorePassword("password")).toEqual({ score: 1, level: "Weak" });
  });

  it("anything under 8 characters is Weak, however mixed", () => {
    expect(scorePassword("Ab1!xyz").level).toBe("Weak");
  });

  it("a long password with few distinct characters is Weak", () => {
    expect(scorePassword("aaaaaaaaaaaaaaaaaaaa").level).toBe("Weak");
  });

  it("8+ characters with some variety is Fair", () => {
    expect(scorePassword("Password1")).toEqual({ score: 2, level: "Fair" });
    expect(scorePassword("correcthorsebattery").level).toBe("Fair");
  });

  it("more length or variety is Good", () => {
    expect(scorePassword("Password1!")).toEqual({ score: 3, level: "Good" });
    expect(scorePassword("Sunsetblvd12").level).toBe("Good");
  });

  it("a long mixed password is Strong", () => {
    expect(scorePassword("Correct-Horse-Battery-9")).toEqual({ score: 4, level: "Strong" });
    expect(scorePassword("Password12!x").level).toBe("Strong");
  });

  it("is pure: same input, same output", () => {
    expect(scorePassword("Password1!")).toEqual(scorePassword("Password1!"));
  });
});

describe("PasswordStrengthMeter render", () => {
  it("the text updates with the password", () => {
    expect(render("password")).toContain("Weak");
    expect(render("Password1")).toContain("Fair");
    expect(render("Password1!")).toContain("Good");
    expect(render("Correct-Horse-Battery-9")).toContain("Strong");
    expect(render("")).not.toMatch(/Weak|Fair|Good|Strong/);
  });

  it("has a native progress element and a polite live text", () => {
    const html = render("Password1!");
    // Native <progress>, not a progressbar role (jsx-a11y
    // prefer-tag-over-role). The visible 4-segment bar is decorative.
    expect(html).toContain("<progress");
    expect(html).toContain('aria-label="Password strength"');
    expect(html).toContain('value="3"');
    expect(html).toContain(`max="${STRENGTH_MAX_SCORE}"`);
    expect(html).toContain('aria-valuetext="Good"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain(`id="${PASSWORD_STRENGTH_ID}"`);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Password strength:");
  });

  it("fills one segment per score step", () => {
    expect(render("Password1").match(/bg-gold\/70/g)).toHaveLength(2);
    expect(render("").match(/bg-gold\/70/g)).toBeNull();
  });

  it("uses tokens only: no raw hex, no gradient, no inline style", () => {
    const meter = src("src/app/account/PasswordStrengthMeter.tsx");
    // "PR #152" in the exception comment is a PR number, not a colour.
    expect(meter).not.toMatch(/(?<!PR )#[0-9a-fA-F]{3,8}\b/);
    expect(meter).not.toMatch(/bg-gradient|linear-gradient|from-\w|to-\w+\//);
    expect(meter).not.toContain("style={{");
    expect(meter).toContain("AGENTS.md self-check exception");
  });
});

describe("account form wiring", () => {
  const client = src("src/app/account/AccountClient.tsx");

  it("the meter renders only in signup mode", () => {
    expect(client).toContain(
      '{mode === "signup" && <PasswordStrengthMeter password={password} />}',
    );
    expect(client.match(/<PasswordStrengthMeter/g)).toHaveLength(1);
  });

  it("the password input points at the meter only in signup mode", () => {
    expect(client).toContain(
      'aria-describedby={mode === "signup" ? PASSWORD_STRENGTH_ID : undefined}',
    );
  });

  it("keeps the existing password rules and show/hide toggle", () => {
    expect(client).toContain('id="acct-password"');
    expect(client).toContain("minLength={8}");
    expect(client).toContain('placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}');
    expect(client).toContain('aria-label={showPassword ? "Hide password" : "Show password"}');
    expect(client).toContain("aria-pressed={showPassword}");
    expect(src("src/app/api/auth/signup/route.ts")).toMatch(/length\s*<\s*8/);
  });

  it("the set-password panel is untouched", () => {
    expect(src("src/app/account/AccountPanels.tsx")).not.toContain("PasswordStrengthMeter");
  });
});
