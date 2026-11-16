/**
 * UX audit Phase 2, F40 (methodology).
 * Every section hid behind a "Show the details" disclosure, so
 * the page read as a list of closed drawers. Each section now
 * shows a one-line summary under its heading, so the page reads
 * without clicking. The details stay for the full rules.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("F40 methodology reads without clicking", () => {
  it("shows one visible summary under each of the 7 headings", () => {
    const m = src("src/app/methodology/page.tsx").replace(/\s+/g, " ");
    const summaries = m.match(/<p className="mt-2 text-sm text-cream\/75">/g);
    expect(summaries).not.toBeNull();
    expect((summaries as RegExpMatchArray).length).toBe(7);
    expect(m).toContain("Tropical zodiac, Placidus houses");
    expect(m).toContain("Sidereal zodiac (Lahiri ayanamsa)");
    expect(m).toContain("not from astronomical bodies");
    expect(m).toContain("never calculates or invents a placement");
    expect(m).toContain("not a personal reading or a prediction");
    expect(m).toContain("never stored or sent to any AI prompt");
  });

  it("keeps the full details behind the disclosures", () => {
    const m = src("src/app/methodology/page.tsx");
    expect((m.match(/<details>/g) ?? []).length).toBe(7);
    expect(m).toContain("Show the details");
  });
});
