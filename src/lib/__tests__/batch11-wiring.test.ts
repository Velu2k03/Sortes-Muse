import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Batch 11: the hero is the one-word brand (Velu, 2026-11-13:
// "Hero dont make sentence, make it short one word" and "Go back
// to normal, that we have sortes word with the effects"). The
// Batch 6b one-sentence headline is gone. Batch 12 (Velu,
// 2026-11-13, Option B): the subhead is Claude's line "A question
// on your mind? Ask the cards. Get a clear answer." The H1
// "Sortes" stays, the free reading stays 1-card Quick Insight
// only, and the 3-card spread is PLANNED as the visible next step
// after the first reading (not built yet; a follow-up feature) —
// so the subhead must NOT promise three cards. The button is
// singular ("Ask your question", one reading takes one question)
// and no longer says "First reading free" (Velu's explicit order).
// The friction line says "No credit card" so it cannot read as
// "no tarot card". The TAGLINE constant ("Cast the lots. Read
// your story.") is the brand line for the footer, share text, and
// metadata — it is NOT the hero, so it stays unchanged.

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

  it("the subhead is Claude's line and does not promise three cards", () => {
    const page = src("src/app/page.tsx");
    // Assert on the hero <p> itself, not the whole file: the comment
    // above the H1 quotes the subhead, so a whole-file toContain
    // would pass even if the <p> were reverted (Sonnet review).
    const match = page.match(
      /<p className="mt-6 max-w-xl text-base[^"]*">([\s\S]*?)<\/p>/
    );
    expect(match).not.toBeNull();
    const subhead = (match as RegExpMatchArray)[1].replace(/\s+/g, " ").trim();
    expect(subhead).toBe(
      "A question on your mind? Ask the cards. Get a clear answer."
    );
    const flat = page.replace(/\s+/g, " ");
    expect(flat).not.toMatch(/(draw|pick)\s+(three|3)\s+cards?/i);
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
