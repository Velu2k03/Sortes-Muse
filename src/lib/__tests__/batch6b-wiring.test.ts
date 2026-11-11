import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Batch 6b: the hero is ONE sentence only (Velu, 2026-11-11:
// "use one sentence only, why two? its confusing the users,
// keep it clean"). Velu picked this sentence (Muse's Option 1;
// Argon's options were not good, Argon is not used). The H1 is
// the single sentence; there is no separate tagline line in the
// hero. The TAGLINE constant ("Cast the lots. Read your story.")
// is the brand line for the footer, share text, and metadata —
// it is NOT the hero, so it stays unchanged.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

const HERO =
  "Ask a question and get a clear AI tarot reading that helps you think it through.";

describe("Batch 6b: one-sentence hero", () => {
  it("the H1 is the single sentence Velu picked", () => {
    const page = src("src/app/page.tsx").replace(/\s+/g, " ");
    expect(page).toContain(HERO);
    // The H1 block, normalised, is exactly the sentence.
    const match = src("src/app/page.tsx").match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    expect(match).not.toBeNull();
    const h1 = (match as RegExpMatchArray)[1].replace(/\s+/g, " ").trim();
    expect(h1).toBe(HERO);
  });

  it("the sentence is one sentence (exactly one period)", () => {
    expect(HERO.split(".").filter(Boolean).length).toBe(1);
    expect(HERO.endsWith(".")).toBe(true);
  });

  it("the hero has no tagline line and does not repeat 'free'", () => {
    const page = src("src/app/page.tsx");
    // No TAGLINE is rendered on the home page at all.
    expect(page).not.toContain("TAGLINE");
    // The H1 does not repeat "free": the CTA already says it.
    const match = page.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    const h1 = (match as RegExpMatchArray)[1];
    expect(h1.toLowerCase()).not.toContain("free");
  });

  it("the subhead and CTA are unchanged", () => {
    const page = src("src/app/page.tsx").replace(/\s+/g, " ");
    expect(page).toContain("Draw a free daily card, explore 78 meanings.");
    expect(page).toContain("Ask your question · First reading free");
    expect(page).toContain("No card, no account.");
  });

  it("the brand TAGLINE is unchanged (footer, share, metadata)", () => {
    const site = src("src/lib/site.ts");
    expect(site).toContain('export const TAGLINE = "Cast the lots. Read your story.";');
  });
});
