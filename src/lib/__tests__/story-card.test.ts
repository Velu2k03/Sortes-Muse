import { describe, it, expect } from "vitest";
import { firstSentence } from "@/lib/story-card";
import { readingToPlainText } from "@/lib/readingMarkdown";

describe("firstSentence", () => {
  it("takes the first sentence of a real interpretation", () => {
    expect(
      firstSentence("The Fool opens a new road. The rest is still unwritten.")
    ).toBe("The Fool opens a new road.");
  });

  it("handles question and exclamation endings", () => {
    expect(firstSentence("What if you began again? Then the cards shift.")).toBe(
      "What if you began again?"
    );
    expect(firstSentence("Begin now! The rest follows.")).toBe("Begin now!");
  });

  it("returns empty for empty or missing text, never inventing one", () => {
    expect(firstSentence("")).toBe("");
    expect(firstSentence("   ")).toBe("");
    expect(firstSentence(undefined)).toBe("");
  });

  it("truncates a single over-long sentence instead of inventing a shorter one", () => {
    const long = "A".repeat(200) + ". Short tail.";
    const out = firstSentence(long);
    expect(out.length).toBeLessThanOrEqual(141);
    expect(out.endsWith("…")).toBe(true);
  });

  it("leaves no markdown in the takeaway once the reading is made plain text", () => {
    const md =
      "## The Heart of the Matter\n\nYou stand at a **threshold**, and *this* is calm.";
    const out = firstSentence(readingToPlainText(md));
    expect(out).not.toMatch(/#|\*/);
    expect(out).toContain("threshold");
  });

  it("keeps a short single sentence whole", () => {
    expect(firstSentence("Sit with this one card today.")).toBe(
      "Sit with this one card today."
    );
  });
});
