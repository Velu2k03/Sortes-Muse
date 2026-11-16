/**
 * UX audit Phase 2, F39 (mobile header).
 * The mobile header was two rows (logo row + tab bar) and showed
 * both a hamburger AND visible nav links, costing 110px on a
 * 667px phone. One nav pattern on mobile now: the hamburger,
 * which is the only route to the sub-pages and to Sign in /
 * Account. NOTE: the tab bar was a Velu-approved decision
 * (unslopovich, PR #102); this reverses it, flagged for his
 * review at the push gate.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("F39 mobile header is one row, one nav pattern", () => {
  it("has no mobile tab bar and no MOBILE_TABS", () => {
    const h = src("src/components/Header.tsx");
    expect(h).not.toContain("MOBILE_TABS");
    expect(h).not.toContain('aria-label="Sections"');
  });

  it("keeps the hamburger as the only mobile nav", () => {
    const h = src("src/components/Header.tsx");
    expect(h).toContain('aria-label="Toggle menu"');
    expect(h).toContain('aria-controls="mobile-nav"');
    expect(h).toContain('id="mobile-nav"');
  });
});
