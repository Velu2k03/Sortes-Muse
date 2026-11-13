import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Title-tag fix (Velu, 2026-11-14, Fable's suggestion): the <title>
// must say "tarot". The old default ("Sortes by Resonant Atlas |
// Cast the lots. Read your story.") had no "tarot" in it, so the
// title, H1 and hero all lacked the word. The approved title is
// "Sortes | AI Tarot Reading Online". TAGLINE stays the footer/share
// brand line; it is NOT the title any more.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Title tag carries tarot", () => {
  it("TITLE_DEFAULT is the approved Fable line", () => {
    const site = src("src/lib/site.ts");
    expect(site).toContain(
      'export const TITLE_DEFAULT = "Sortes | AI Tarot Reading Online";'
    );
  });

  it("layout uses TITLE_DEFAULT as the title default", () => {
    const layout = src("src/app/layout.tsx");
    expect(layout).toContain("default: TITLE_DEFAULT,");
    expect(layout).not.toContain("default: `${APP_NAME} | ${TAGLINE}`,");
  });

  it("the title default contains tarot", () => {
    const site = src("src/lib/site.ts");
    const match = site.match(/export const TITLE_DEFAULT = "([^"]+)";/);
    expect(match).not.toBeNull();
    expect((match as RegExpMatchArray)[1].toLowerCase()).toContain("tarot");
  });
});
