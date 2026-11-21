/**
 * All-pages fix 11 (break the center, /account): the account
 * headings and intros are left-aligned, PR #123 Run B pattern.
 *
 * Before: 5 text-center uses in src/app/account/AccountClient.tsx,
 * the count from the all-pages audit of 2026-11-17. The audit
 * said "5 text-center in AccountClient + panels", but a grep of
 * the route finds all 5 in AccountClient.tsx and 0 in
 * AccountPanels.tsx: every panel heading and intro there was
 * already left-aligned, so no panel file changed.
 * After: 4 left-aligned, 1 kept centered.
 *
 * Left-aligned (4): the h1 (line 89, "Your account" once signed
 * in, "Sign in" for guests, one plain h1 element, not SplitText,
 * so no inline textAlign style fights the class, unlike the
 * /reading SplitText h1; the h1 text and tag are unchanged);
 * the "Forgot your password? Sign in with an email link instead"
 * helper line in the password form; the "Bought Oracles with a
 * different email?" note under the password submit button; and
 * the "No account with this email yet?" note in the email-link
 * form. All four are text lines in a full-width panel, the same
 * call as the /reports privacy note and the /reading disclaimer
 * footnote left-aligned in fixes 4 and 5.
 *
 * Kept centered (1): the verification-code input (line 575).
 * Its text-center centers the typed digits inside the input, not
 * a text block: a 6-digit code with tracking-[0.5em], the same
 * family as the button labels kept centered on /spreads, and
 * the audit itself lists it as a pattern ("Verification code
 * input uses tracking-[0.5em], centered text"), not a fix.
 *
 * Audit CHECKs, verified here, not changed in this branch:
 * delete has a two-step confirmation, first tap arms it, then
 * a confirmation block demands the account password or a fresh
 * 6-digit sign-in code and a second tap on "Confirm delete
 * account?"; there is no undo window, the deletion is stated
 * permanent. The notifications checkbox is label-wrapped: the
 * input sits inside its <label> ("Stop win-back emails"),
 * AccountPanels.tsx, NotificationsPanel.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("break the center, /account: headings and intros left-aligned", () => {
  it("h1 is left-aligned, text and tag unchanged", () => {
    const client = src("src/app/account/AccountClient.tsx");
    expect(client).toContain(
      '<h1 className="mt-3 text-left font-display text-5xl text-goldbright">',
    );
    expect(client).not.toContain(
      '<h1 className="mt-3 text-center font-display text-5xl text-goldbright">',
    );
    // One plain h1 element, "Your account" signed in, "Sign in"
    // for guests; no second h1 on the route.
    expect(client).toContain('{user ? "Your account" : "Sign in"}');
    expect(client.match(/<h1/g) ?? []).toHaveLength(1);
  });

  it("sign-in helper lines are left-aligned", () => {
    const client = src("src/app/account/AccountClient.tsx");
    // "Forgot your password? Sign in with an email link instead"
    // helper line in the password form.
    expect(client).toContain('<p className="text-left text-sm">');
    expect(client).not.toContain('<p className="text-center text-sm">');
    // "Bought credits with a different email?" note under the
    // password submit button.
    expect(client).toContain(
      '<p className="text-left text-xs text-mist">\n              Bought credits with a different email? They merge in when',
    );
    // "No account with this email yet?" note in the email-link form.
    expect(client).toContain(
      '<p className="text-left text-xs text-mist">\n              No account with this email yet? Signing in with an email link',
    );
    expect(client).not.toContain(
      '<p className="text-center text-xs text-mist">',
    );
  });

  it("exactly 1 text-center use remains: the code input's own digits", () => {
    const client = src("src/app/account/AccountClient.tsx");
    expect(client.match(/text-center/g) ?? []).toHaveLength(1);
    // The one remaining use centers the typed digits inside the
    // 6-digit verification-code input, not a text block.
    expect(client).toContain(
      'className="w-full rounded-xl border border-gold/25 bg-panel/70 px-4 py-3 text-center text-2xl tracking-[0.5em] text-cream',
    );
    // AccountPanels needed no change: no text-center there at all.
    const panels = src("src/app/account/AccountPanels.tsx");
    expect(panels.match(/text-center/g) ?? []).toHaveLength(0);
  });

  it("delete confirmation and notification checkbox are as the audit found them", () => {
    const panels = src("src/app/account/AccountPanels.tsx");
    // Delete is two-step: first tap arms it ("Confirm delete
    // account?"), then a confirmation block demands the account
    // password or a fresh 6-digit sign-in code, and a second tap
    // goes ahead. No undo window; the deletion is permanent.
    expect(panels).toContain('"Confirm delete account?"');
    expect(panels).toContain('id="delete-password"');
    expect(panels).toContain('id="delete-code"');
    expect(panels).toContain("This cannot be undone.");
    // The notifications checkbox is label-wrapped: the input
    // sits inside its <label>, so no id/aria-label is needed.
    expect(panels).toContain(
      '<label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-base text-cream">',
    );
    expect(panels).toContain('type="checkbox"');
    expect(panels).toContain("Stop win-back emails");
  });
});
