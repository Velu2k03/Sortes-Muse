import { describe, expect, it } from "vitest";
import { SAMPLE_INTERPRETATION } from "@/components/SampleReading";

// Phase E (item 9): the sample reading must stay a full paid-style
// reading, not drift back to a teaser. Word band, card names,
// one step, one question.
describe("SAMPLE_INTERPRETATION", () => {
  it("is a full 350-550 word reading naming all three cards, with one step and one reflection question", () => {
    const words = SAMPLE_INTERPRETATION.trim().split(/\s+/).length;
    expect(words).toBeGreaterThanOrEqual(350);
    expect(words).toBeLessThanOrEqual(550);
    for (const card of ["Two of Wands", "Chariot", "Star"]) {
      expect(SAMPLE_INTERPRETATION).toContain(card);
    }
    expect(SAMPLE_INTERPRETATION).toMatch(/one practical step/i);
    expect((SAMPLE_INTERPRETATION.match(/\?/g) ?? []).length).toBe(1);
  });
});
