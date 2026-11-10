import { describe, it, expect } from "vitest";
import { parseReading } from "@/lib/readingMarkdown";

const flat = (t: string) =>
  parseReading(t).map((b) => ({ h: b.heading, t: b.words.map((w) => w.text).join(" ") }));

describe("parseReading (audit item 6)", () => {
  const sample =
    "**Opening**\nThe Tower sits at your crossing.\n\n# Insight\nSomething **breaks open** here.\n\nSecond paragraph.";

  it("keeps paragraph breaks and turns headings into heading blocks", () => {
    expect(flat(sample)).toEqual([
      { h: true, t: "Opening" },
      { h: false, t: "The Tower sits at your crossing." },
      { h: true, t: "Insight" },
      { h: false, t: "Something breaks open here." },
      { h: false, t: "Second paragraph." },
    ]);
  });

  it("never leaves raw ** or # in any word", () => {
    const all = parseReading(sample).flatMap((b) => b.words.map((w) => w.text));
    expect(all.some((w) => w.includes("*") || w.includes("#"))).toBe(false);
  });

  it("flags inline bold and drops an unmatched marker", () => {
    const [b] = parseReading("a **b c** d **e");
    expect(b.words.map((w) => [w.text, w.bold])).toEqual([
      ["a", false], ["b", true], ["c", true], ["d", false], ["e", true],
    ]);
  });
});
