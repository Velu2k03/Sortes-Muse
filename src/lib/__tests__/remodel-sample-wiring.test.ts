import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

// Remodel Phase 1 batch 2 (Velu, 2026-11-14): today's card as the
// sample reading below the hero, "How it works" as Ask/Draw/Read,
// and the pending hero question echoed on the intake category step
// (Sonnet nit 7 from Batch 1, most worth acting on). Copy is
// asserted on the actual JSX elements, not the whole file: the
// comments above the copy quote it, so a whole-file toContain would
// pass even if the element were reverted (Sonnet review lesson from
// Batch 12).
//
// MagicBento (the plan's pick for the How-it-works cards) is NOT
// used: its vendored file fails the repo lint out of the box
// (4 react-hooks/refs errors for ref writes during render, 1
// @next/next/no-img-element warning; the gate needs 0 errors and 0
// warnings), and Phase 4C already removed its cursor glow from this
// page as a gimmick. The existing motion step cards stay.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Remodel sample: today's card below the hero", () => {
  it("renders the sample section directly below the hero", () => {
    const page = src("src/app/page.tsx");
    expect(page).toContain('import TodaySample from "@/components/TodaySample"');
    const sampleAt = page.indexOf("<TodaySample />");
    expect(sampleAt).toBeGreaterThan(-1);
    // Below the hero (after its submit button) and above StatsStrip.
    expect(sampleAt).toBeGreaterThan(page.indexOf("Draw my card"));
    expect(sampleAt).toBeLessThan(page.indexOf("<StatsStrip />"));
  });

  it("labels the sample clearly and shows one card, one line", () => {
    const sample = src("src/components/TodaySample.tsx");
    const eyebrow = sample.match(
      /<p className="text-xs uppercase tracking-\[0\.35em\] text-gold">([\s\S]*?)<\/p>/
    );
    expect(eyebrow).not.toBeNull();
    expect((eyebrow as RegExpMatchArray)[1].trim()).toBe("Sample reading");
    const h2 = sample.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    expect(h2).not.toBeNull();
    expect((h2 as RegExpMatchArray)[1].replace(/\s+/g, " ").trim()).toBe(
      "Today&apos;s card"
    );
    expect(sample).toContain(
      "One card, one line — an example of what a reading looks like."
    );
    // One section only; the Daily Card Teaser further down the page
    // ("One card, every morning") is the draw CTA and stays as-is.
    expect(sample.match(/<section/g)?.length).toBe(1);
    const page = src("src/app/page.tsx");
    expect(page).toContain("One card, every morning");
    expect(page).toContain("Draw today&apos;s card");
  });

  it("reuses the daily card and falls back to the plan's Star example", () => {
    const sample = src("src/components/TodaySample.tsx");
    // The /daily route's stored draw (getDailyCard), not a new
    // picker: there is no date-seeded deterministic pick in the
    // repo, the draw is a per-device random draw stored for the day.
    expect(sample).toContain("getDailyCard()");
    expect(sample).not.toContain("drawSingle");
    // No card drawn yet: the plan's fixed example, The Star with
    // the plan's example line.
    expect(sample).toContain('getCard(SAMPLE_CARD_ID)');
    expect(sample).toContain('const SAMPLE_CARD_ID = "major-17"');
    expect(sample).toContain(
      "A new beginning is closer than you think. Take the small step today."
    );
    // A drawn card shows its art, name, and the first sentence of
    // its meaning only, so the reading stays one line.
    expect(sample).toContain("orientationMeaning(card, daily.reversed)");
    expect(sample).toContain("firstSentence");
    expect(sample).toContain('src={card.image}');
    expect(sample).toContain("{card.name}");
    expect(sample).toContain('href="/daily"');
  });
});

describe("Remodel How it works: Ask, Draw, Read", () => {
  it("has its own How it works heading above the steps", () => {
    const page = src("src/app/page.tsx");
    const headings = [...page.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map(
      (m) => m[1].replace(/\s+/g, " ").trim()
    );
    expect(headings).toContain("How it works");
    // The "What is tarot?" one-liner stays where it is.
    expect(page).toContain(
      "78 cards. Tarot helps you think. It doesn&apos;t predict."
    );
  });

  it("rewrites the three steps as Ask, Draw, Read", () => {
    const page = src("src/app/page.tsx");
    const step = (title: string) => {
      const match = page.match(
        new RegExp(`title:\\s*"${title}",\\s*text:\\s*"([^"]+)"`)
      );
      expect(match).not.toBeNull();
      return (match as RegExpMatchArray)[1];
    };
    expect(step("Ask")).toBe("Type the question on your mind.");
    expect(step("Draw")).toBe("Draw a card from the deck.");
    expect(step("Read")).toBe("Get a reading written for your question.");
    // The old Draw/Reflect/Return steps are gone, not duplicated
    // elsewhere on the page.
    expect(page).not.toContain('title: "Reflect"');
    expect(page).not.toContain('title: "Return"');
    expect(page).not.toContain("Shuffle, lay the cards face down");
    expect(page).not.toContain("Read the meanings first");
  });

  it("keeps the motion step cards: no MagicBento", () => {
    const page = src("src/app/page.tsx");
    // No import and no JSX usage (the comment above the steps names
    // MagicBento only to record why it is not used).
    expect(page).not.toContain("@/components/MagicBento");
    expect(page).not.toContain("<MagicBento");
    expect(existsSync(path.resolve(process.cwd(), "src/components/MagicBento.tsx"))).toBe(
      false
    );
  });
});

describe("Remodel intake: pending hero question echoed on the category step", () => {
  it("peeks (does not consume) and shows the question on Quick Insight only", () => {
    const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
    expect(steps).toContain("peekHeroQuestion");
    expect(steps).toContain('f.spread.slug !== "quick-insight"');
    // Peek only: consuming here would lose the question on a refresh
    // before a category is picked (the hook consumes it once a
    // category is set).
    expect(steps).not.toContain("takeHeroQuestion");
    const echo = steps.match(
      /Your question: &ldquo;\{pendingQuestion\}&rdquo;/
    );
    expect(echo).not.toBeNull();
    // Read past the effect (repo pattern): the server HTML has no
    // echo, so the first client render must match it.
    expect(steps).toContain("queueMicrotask(() => setPendingQuestion(peekHeroQuestion()))");
  });
});
