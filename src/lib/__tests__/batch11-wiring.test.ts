import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Batch 11: the hero was the one-word brand (Velu, 2026-11-13).
// Batch 12 (Velu, 2026-11-13, Option B): the subhead was Claude's
// line. BOTH are superseded by the remodel (Velu, 2026-11-14,
// Fable's review): the H1 is now Fable's explanation, the subhead
// is Fable's fix, and "Sortes" lives in the header logo. The free
// reading stays 1-card Quick Insight only, and the 3-card spread is
// PLANNED as the visible next step after the first reading (the nudge
// link to it is built in remodel batch 3; the spread itself already
// exists) — so the hero must NOT promise three cards. The TAGLINE constant ("Cast the lots. Read your
// story.") is the brand line for the footer, share text, and
// metadata — it is NOT the hero, so it stays unchanged.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Batch 11: one-word brand hero (superseded by the remodel)", () => {
  it("the H1 is Fable's explanation, not the one-word brand", () => {
    const page = src("src/app/page.tsx");
    const match = page.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    expect(match).not.toBeNull();
    const h1 = (match as RegExpMatchArray)[1].replace(/\s+/g, " ").trim();
    expect(h1).toBe("Ask a question. Draw a tarot card. Get an AI reading.");
  });

  it("the subhead is Fable's fix and does not promise three cards", () => {
    const page = src("src/app/page.tsx");
    // Assert on the hero <p> itself, not the whole file: the comment
    // above the H1 quotes the change, so a whole-file toContain
    // would pass even if the <p> were reverted (Sonnet review).
    const match = page.match(
      /<p className="mt-6 max-w-xl text-base[^"]*">([\s\S]*?)<\/p>/
    );
    expect(match).not.toBeNull();
    const subhead = (match as RegExpMatchArray)[1].replace(/\s+/g, " ").trim();
    expect(subhead).toBe(
      "A question on your mind? Ask the cards. Get a clearer way to see it."
    );
    const flat = page.replace(/\s+/g, " ");
    expect(flat).not.toMatch(/(draw|pick)\s+(three|3)\s+cards?/i);
  });

  it("the button is the gold submit 'Draw my card — free', gated on free", () => {
    const page = src("src/app/page.tsx").replace(/\s+/g, " ");
    // Sonnet review: the "free" wording shows only when the first
    // reading is actually free (Batch 6a rule, ReturnLoop pattern).
    expect(page).toContain(
      'freeAvailable ? "Draw my card — free" : "Draw my card"'
    );
    expect(page).not.toContain("Ask your question");
  });

  it("the friction line says the first reading is free, no sign-up, no payment, gated on free", () => {
    const page = src("src/app/page.tsx").replace(/\s+/g, " ");
    expect(page).toContain("Your first reading is free — no sign-up, no payment.");
    expect(page).toContain("{freeAvailable && (");
    expect(page).not.toContain("No credit card, no account.");
  });

  it("the brand TAGLINE is unchanged (footer, share, metadata)", () => {
    const site = src("src/lib/site.ts");
    expect(site).toContain('export const TAGLINE = "Cast the lots. Read your story.";');
  });
});
