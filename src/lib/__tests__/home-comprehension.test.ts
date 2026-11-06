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

const src = readFileSync(path.resolve(process.cwd(), "src/app/page.tsx"), "utf8").replace(
  /\s+/g,
  " "
);

describe("home page: first-visit comprehension", () => {
  it("states what Sortes does", () => {
    expect(src).toContain("Draw a free daily card, explore 78 card meanings, and get a reading for your question.");
    expect(src).toContain("78 cards. A mirror for the mind, not a verdict on your future.");
    expect(src).toContain("Sortes is Latin for lots");
  });

  it("states what is free", () => {
    expect(src).toContain("Your first Quick Insight reading is free. No card, no account.");
    expect(src).toContain("Free Western, Vedic, and Ziwei birth chart calculations.");
    expect(src).toContain("FIRST FREE");
  });

  it("states what costs credits", () => {
    expect(src).toContain("After that, a reading is 1 Oracle.");
    expect(src).toContain("$3.99 for 5 Oracles");
    expect(src).toContain("Oracles never expire. No subscription.");
    expect(src).toContain("First free · then 1 Oracle");
  });

  it("states what a paid reading gives", () => {
    expect(src).toContain("Read the meanings first, then the interpretation for your question.");
    expect(src).toContain("Every reading is saved to your journal.");
    expect(src).toContain("All spreads, one Oracle each");
  });
});
