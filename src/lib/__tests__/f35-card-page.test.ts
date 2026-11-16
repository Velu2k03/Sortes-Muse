/**
 * UX audit Phase 2, F35 (card page).
 * "Use this card in a reading" offered four buttons at once. One
 * primary + one secondary now; the two named spreads are reachable
 * from the spreads page.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("F35 card page has one primary + one secondary action", () => {
  it("only Quick Insight (primary) and All spreads (secondary) remain", () => {
    const page = src("src/app/deck/[slug]/page.tsx");
    expect(page).toContain("Quick Insight, free first");
    expect(page).toContain("All spreads");
    expect(page).not.toContain("/spreads/past-present-future");
    expect(page).not.toContain("/spreads/celtic-cross");
    expect(page).not.toContain("Celtic Cross");
  });
});
