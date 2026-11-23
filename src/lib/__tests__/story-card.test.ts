import { describe, it, expect } from "vitest";
import { bodySentence, firstSentence } from "@/lib/story-card";
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

describe("bodySentence (Batch 1, S4)", () => {
  const SAMPLE = [
    "## Your question",
    "",
    "Maya, you asked whether to take the new role or stay where you are.",
    "",
    "## The Fool, in the Present",
    "",
    "The Fool shows a part of you that is ready to step into something unfamiliar. It is ok.",
    "",
    "What would change if you treated this as an experiment?",
    "",
    "This reflection is not financial advice. Please speak with a licensed professional about any financial decision.",
  ].join("\n");

  it("quotes a sentence from the body, never the opening sentence that restates the question", () => {
    const out = bodySentence(readingToPlainText(SAMPLE));
    expect(out).toBe("The Fool shows a part of you that is ready to step into something unfamiliar.");
    expect(out).not.toContain("you asked");
    expect(firstSentence(readingToPlainText(SAMPLE))).toContain("you asked");
  });

  it("skips the reflection question, short lines, and closing/disclaimer lines", () => {
    const text = [
      "Opening restates the question here in full.",
      "It is ok.",
      "What would you change?",
      "This reflection is not medical advice. Please speak with a licensed professional about any health concern.",
      "The Star asks you to rest before you decide anything big this week.",
    ].join("\n\n");
    expect(bodySentence(text)).toBe("The Star asks you to rest before you decide anything big this week.");
  });

  it("caps a long body sentence at 140 characters", () => {
    const text = `Opening sentence that restates the question. ${"The Moon ".repeat(30)}keeps going.`;
    const out = bodySentence(text);
    expect(out.length).toBeLessThanOrEqual(141);
    expect(out.endsWith("…")).toBe(true);
    expect(out.startsWith("The Moon")).toBe(true);
  });

  it("falls back to the first sentence only when there is no body sentence", () => {
    expect(bodySentence("Only one sentence here.")).toBe("Only one sentence here.");
    expect(bodySentence("")).toBe("");
    expect(bodySentence(undefined)).toBe("");
  });

  it("drops list markers so a numbered item is not quoted as '1.'", () => {
    const text = "Opening line restates it.\n\n1. The Hermit invites a quiet hour alone with the decision.";
    expect(bodySentence(text)).toBe("The Hermit invites a quiet hour alone with the decision.");
  });
});
