import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Phase G: first-visit comprehension, code level. A first-time visitor
// must be able to answer four questions from the home page alone:
// what Sortes does, what is free, what costs credits, and what a paid
// reading gives. The live-browser confirmation (a real person reading
// the page) is in hidden_files/phaseG-e2e-plans.md; this test pins
// the copy so a later edit cannot silently drop one of the four
// answers. It reads the page source, the same way charts-check pins
// copy elsewhere in this repo.
//
// AF-034 (homepage diet): the homepage no longer carries the pricing
// detail or the Latin line — cash prices live on /oracles, the Latin
// line was dropped, and the duplicate "All spreads" grid is gone.
// The four answers below are the diet versions: home still states
// what is free and that a reading costs 1 Oracle, and /oracles
// carries the cash price the home page used to repeat.

const src = readFileSync(path.resolve(process.cwd(), "src/app/page.tsx"), "utf8").replace(
  /\s+/g,
  " "
);

describe("home page: first-visit comprehension", () => {
  it("states what Sortes does", () => {
    // Batch 11 (Velu, 2026-11-13): the hero is the one-word brand
    // "Sortes". Batch 12 (Velu, 2026-11-13, Option B): the subhead
    // is Claude's line "A question on your mind? Ask the cards.
    // Get a clear answer." The free reading stays 1-card Quick
    // Insight only; the 3-card spread is the next step, not the
    // hero promise. The Batch 6b sentence headline is gone.
    expect(src).toContain(
      "A question on your mind? Ask the cards. Get a clear answer."
    );
    // Batch 6a: the "mirror" line is replaced by the plain version.
    expect(src).toContain("78 cards. Tarot helps you think. It doesn&apos;t predict.");
  });

  it("states what is free", () => {
    // Round-3 sample text for the hero small print. Batch 11:
    // "No card" became "No credit card" so it cannot read as
    // "no tarot card".
    expect(src).toContain("No credit card, no account.");
    expect(src).toContain("First free · then 1 Oracle");
  });

  it("states what costs credits", () => {
    expect(src).toContain("First free · then 1 Oracle");
    // Cash price moved to /oracles by the AF-034 diet (AF-011 SSR):
    // the pack data is in lib/site and the never-expire line in the
    // /oracles client copy.
    expect(src).toContain("First free · then 1 Oracle");
    // Cash price moved to /oracles by the AF-034 diet (AF-011 SSR):
    // the pack data is in lib/site and the never-expire line in the
    // /oracles client copy.
    const siteSrc = readFileSync(
      path.resolve(process.cwd(), "src/lib/site.ts"),
      "utf8"
    ).replace(/\s+/g, " ");
    expect(siteSrc).toContain('readings: 5, price: 3.99');
    const creditsSrc = readFileSync(
      path.resolve(process.cwd(), "src/app/oracles/CreditsClient.tsx"),
      "utf8"
    ).replace(/\s+/g, " ");
    expect(creditsSrc).toContain("Oracles never expire");
  });

  it("states what a paid reading gives", () => {
    expect(src).toContain("Read the meanings first, then the interpretation for your question.");
    expect(src).toContain("Every reading is saved to your journal.");
    // The sample section is a component on the homepage.
    const sampleSrc = readFileSync(
      path.resolve(process.cwd(), "src/components/SampleReading.tsx"),
      "utf8"
    ).replace(/\s+/g, " ");
    expect(sampleSrc).toContain("See what a personalized reading feels like");
  });

  it("has one primary CTA, the free reading (AF-034)", () => {
    // Batch 11: the button is singular "Ask your question" and no
    // longer says "First reading free" (Velu's explicit order).
    expect(src).toContain("Ask your question");
    expect(src).not.toContain("Ask your question · First reading free");
    expect(src).not.toContain("All spreads, one Oracle each");
    expect(src).not.toContain("Sortes is Latin for lots");
  });
});
