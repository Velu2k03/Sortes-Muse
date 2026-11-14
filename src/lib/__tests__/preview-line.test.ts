import { describe, expect, it } from "vitest";
import { previewLine } from "@/lib/preview-line";

// Sonnet nit (PR #85): the wiring test only pinned that the parser
// was used, not the behaviour. These cases pin it: a heading-led
// interpretation yields one plain sentence, never the whole reading
// with raw markers; list-only and heading-only readings fall back
// without raw text; long first sentences are capped.
describe("previewLine", () => {
  it("takes the first prose sentence past a heading line", () => {
    expect(
      previewLine("## The heart of it\nYou are standing at a threshold. More follows.")
    ).toBe("You are standing at a threshold.");
  });

  it("strips bold markers from the first sentence", () => {
    expect(
      previewLine("# Title\n\n**The Star** brings hope. Then more.")
    ).toBe("The Star brings hope.");
  });

  it("handles a bold-only heading line", () => {
    expect(previewLine("**Overview**\nA calm reading. Next.")).toBe("A calm reading.");
  });

  it("falls back to a list item without raw markers", () => {
    const out = previewLine("- one thing.\n- two things.");
    expect(out).toBe("one thing.");
    expect(out).not.toContain("-");
  });

  it("returns empty for a heading-only reading", () => {
    expect(previewLine("## Only heading")).toBe("");
    expect(previewLine("")).toBe("");
  });

  it("caps a long first sentence at 160 chars", () => {
    const long = `A ${"very ".repeat(60)}long sentence that keeps going. Second.`;
    const out = previewLine(long);
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith("…")).toBe(true);
  });

  it("returns plain prose unchanged when it is already one sentence", () => {
    expect(previewLine("A quiet yes counts the same as a loud one.")).toBe(
      "A quiet yes counts the same as a loud one."
    );
  });
});
