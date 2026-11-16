/**
 * UX audit Phase 2, F33 (homepage sparse sections).
 * Sections were padded far beyond their content (py-16/py-12,
 * ~28% of the page height empty). Padding is now py-8/py-10.
 * The suggested merge of "What is tarot?" + sample + daily teaser
 * into one stretch was NOT done: the sections have different
 * backgrounds (cream vs navy bands) and merging would reorder the
 * funnel; the padding cuts achieve the saving while preserving the
 * alternating rhythm.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("F33 homepage sections are tight, not empty bands", () => {
  it("no section uses the old loose padding", () => {
    const page = src("src/app/page.tsx");
    const loop = src("src/components/ReturnLoop.tsx");
    expect(page).not.toContain("py-16");
    expect(page).not.toContain("py-12");
    expect(loop).not.toContain("py-12");
    expect(loop).not.toContain("py-16");
  });

  it("sections use tight padding (py-8/py-10)", () => {
    const page = src("src/app/page.tsx");
    const sections = page.match(/<section className="[^"]*py-(8|10)[^"]*"/g) ?? [];
    expect(sections.length).toBeGreaterThanOrEqual(5);
  });
});
