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

  it("JSON-LD Organization and WebSite both carry the site description", () => {
    const layout = src("src/app/layout.tsx");
    // One copy of the wording: metadata, OG, Twitter and JSON-LD
    // all use SITE_DESCRIPTION, so it cannot drift between them.
    // Loose match (Batch N3, C3): the exact-string assertion broke
    // on any Prettier reflow or wording edit. The two object-literal
    // regexes below already pin that the JSON-LD nodes use the const.
    expect(layout).toMatch(
      /const SITE_DESCRIPTION =\s*"[^"]*tarot[^"]*"/,
    );
    // Assert on the actual object literals, not a whole-file
    // contains: a comment quoting the text would pass that.
    expect(layout).toMatch(
      /"@type": "Organization",\s+name: APP_NAME,\s+url: SITE_URL,\s+email: CONTACT_EMAIL,\s+description: SITE_DESCRIPTION,/
    );
    expect(layout).toMatch(
      /"@type": "WebSite",\s+name: APP_NAME,\s+url: SITE_URL,\s+description: SITE_DESCRIPTION,/
    );
  });
});
