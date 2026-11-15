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
    // Hero rotation (Velu, 2026-11-15): the hero subhead is the
    // rotating variant H2 (personal insights into love, life, and
    // the choices ahead), rendered from the variants data. The free
    // reading stays 1-card Quick Insight only; the 3-card spread is
    // PLANNED as the next step (not built yet), not the hero promise.
    const variantsSrc = readFileSync(
      path.resolve(process.cwd(), "src/lib/hero-variants.ts"),
      "utf8"
    ).replace(/\s+/g, " ");
    expect(variantsSrc).toContain("Get personal insights");
    expect(variantsSrc).toContain("Explore personal insights");
    expect(src).toContain("{variant.h2}");
    // Batch 6a: the "mirror" line is replaced by the plain version.
    expect(src).toContain("78 cards. Tarot helps you think. It doesn&apos;t predict.");
  });

  it("states what is free", () => {
    // Remodel: the friction line is Fable's "no sign-up, no
    // payment" wording.
    expect(src).toContain("Your first reading is free — no sign-up, no payment.");
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
    // Remodel Phase 1 batch 2: the old Draw/Reflect/Return steps are
    // now Ask/Draw/Read. The Read step states the interpretation, and
    // the hero privacy line states the journal save.
    expect(src).toContain("Get a reading written for your question.");
    expect(src).toContain("Your reading is written just for you and saved in your journal.");
    // The sample section is a component on the homepage.
    const sampleSrc = readFileSync(
      path.resolve(process.cwd(), "src/components/SampleReading.tsx"),
      "utf8"
    ).replace(/\s+/g, " ");
    expect(sampleSrc).toContain("See what a personalized reading feels like");
  });

  it("has one primary CTA, the free reading (AF-034)", () => {
    // Hero rotation (Velu, 2026-11-15): the hero CTA is the gold
    // submit with the variant's primary CTA label ("Find Your
    // Clarity" / "Begin Your Reading" / "Discover Your Future"),
    // and it works with no question typed. The "free" wording now
    // lives only in the friction line below, still gated on
    // freeAvailable (Batch 6a rule), so a returner who already
    // used the free reading sees the hero without the free promise.
    const variantsSrc = readFileSync(
      path.resolve(process.cwd(), "src/lib/hero-variants.ts"),
      "utf8"
    ).replace(/\s+/g, " ");
    expect(variantsSrc).toContain("Find Your Clarity");
    expect(variantsSrc).toContain("Begin Your Reading");
    expect(variantsSrc).toContain("Discover Your Future");
    expect(src).toContain("{variant.primaryCta}");
    expect(src).not.toContain("Ask your question");
    expect(src).not.toContain("All spreads, one Oracle each");
    expect(src).not.toContain("Sortes is Latin for lots");
  });
});
