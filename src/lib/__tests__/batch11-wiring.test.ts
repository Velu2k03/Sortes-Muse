import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Batch 11: the hero is the one-word brand (Velu, 2026-11-13:
// "Hero dont make sentence, make it short one word" and "Go back
// to normal, that we have sortes word with the effects"). The
// Batch 6b one-sentence headline is gone. The subhead carries what
// the app does ("a clear tarot reading you can trust", with
// "tarot" added on Claude's review so the visible hero says what
// the product is). The button is singular ("Ask your question",
// one reading takes one question) and no longer says "First
// reading free" (Velu's explicit order). The friction line says
// "No credit card" so it cannot read as "no tarot card". The
// TAGLINE constant ("Cast the lots. Read your story.") is the
// brand line for the footer, share text, and metadata — it is NOT
// the hero, so it stays unchanged.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Batch 11: one-word brand hero", () => {
  it("the H1 is exactly the one-word brand", () => {
    const page = src("src/app/page.tsx");
    const match = page.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    expect(match).not.toBeNull();
    const h1 = (match as RegExpMatchArray)[1].replace(/\s+/g, " ").trim();
    expect(h1).toBe("Sortes");
  });

  it("the subhead names tarot and the promise", () => {
    const page = src("src/app/page.tsx").replace(/\s+/g, " ");
    expect(page).toContain(
      "Ask what is on your mind and get a clear tarot reading you can trust."
    );
  });

  it("the button is singular and does not say 'First reading free'", () => {
    const page = src("src/app/page.tsx").replace(/\s+/g, " ");
    expect(page).toContain("Ask your question");
    expect(page).not.toContain("Ask your question · First reading free");
    expect(page).not.toContain("Ask your questions");
  });

  it("the friction line says 'No credit card, no account.'", () => {
    const page = src("src/app/page.tsx").replace(/\s+/g, " ");
    expect(page).toContain("No credit card, no account.");
    expect(page).not.toContain("No card, no account.");
  });

  it("the brand TAGLINE is unchanged (footer, share, metadata)", () => {
    const site = src("src/lib/site.ts");
    expect(site).toContain('export const TAGLINE = "Cast the lots. Read your story.";');
  });
});
