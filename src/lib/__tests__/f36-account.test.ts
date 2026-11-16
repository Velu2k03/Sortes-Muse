/**
 * UX audit Phase 2, F36 (account guest).
 * The H1 said "Your account" but a signed-out visitor sees a
 * sign-in wall. The H1 is client-rendered now: "Sign in" for
 * guests, "Your account" once signed in. The form is tightened so
 * the gold submit sits above the fold at 1440x900.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("F36 account H1 matches what the visitor sees", () => {
  it("the H1 is client-rendered by auth state, not a server 'Your account'", () => {
    const page = src("src/app/account/page.tsx");
    expect(page).not.toContain("<h1");
    expect(page).not.toContain('>Your account</h1>');
    const client = src("src/app/account/AccountClient.tsx");
    expect(client).toContain('{user ? "Your account" : "Sign in"}');
  });

  it("the page top is tight so the submit fits above the fold", () => {
    const page = src("src/app/account/page.tsx");
    expect(page).toContain("py-8");
    expect(page).not.toContain("py-12");
  });
});
