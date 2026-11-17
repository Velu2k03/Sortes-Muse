/**
 * UX audit Phase 2, F31 (about).
 * The disclaimer appeared three times (founder story, a whole
 * "Reflection, not prediction" section, the footer); the intake
 * flow was said twice; the copy named a provider (OpenRouter).
 * One disclaimer per page (the footer carries it); one intake
 * sentence; no provider name. The first-person founder story stays.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("F31 about says it once", () => {
  it("one intake sentence, no provider name, no in-body disclaimer", () => {
    const about = src("src/app/about/page.tsx");
    // The founder story wraps across source lines, so compare on
    // whitespace-collapsed text.
    const flat = about.replace(/\s+/g, " ");
    // Phase 7 (7.3): the origin story is shortened per the cut list.
    expect(flat).toContain("the cards to speak to your story, not plain card meanings.");
    // Phase 7 (7.3): "The readings are written by AI." is cut here,
    // the site says it elsewhere (the sample reading spec).
    expect(about).not.toContain("through OpenRouter");
    expect(about).not.toContain("OpenRouter");
    expect(about).not.toContain("the client says their story and the cards speak to it");
    expect(about).not.toContain(
      "Readings are for reflection and perspective only, never guaranteed predictions."
    );
  });

  it("the duplicate disclaimer section is gone; the founder story stays", () => {
    const about = src("src/app/about/page.tsx");
    expect(about).not.toContain("Reflection, not prediction</h2>");
    // Phase 7 (7.3): the origin story is shortened, same meaning.
    expect(about).toContain("A friend&apos;s tarot business gave me the idea.");
    expect(about).toContain("Why I built it</h2>");
    expect(about).toContain("Who runs Sortes</h2>");
    expect(about).toContain("What Sortes offers</h2>");
    expect(about).toContain("How your data is handled</h2>");
  });
});
