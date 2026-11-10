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

describe("parseReading: lists, italics, rules (D2)", () => {
  it("groups unordered list items and strips markers", () => {
    const blocks = parseReading("Intro line\n- first thing\n* second thing\n\nAfter.");
    expect(blocks.map((b) => [b.list ?? null, b.words.map((w) => w.text).join(" ")])).toEqual([
      [null, "Intro line"],
      ["ul", "first thing"],
      ["ul", "second thing"],
      [null, "After."],
    ]);
  });

  it("parses ordered list items without the number marker", () => {
    const blocks = parseReading("1. one\n2. two\n10. ten");
    expect(blocks.every((b) => b.list === "ol")).toBe(true);
    expect(blocks.map((b) => b.words.map((w) => w.text).join(" "))).toEqual(["one", "two", "ten"]);
  });

  it("flags *italic* separately from **bold** and drops the markers", () => {
    const [b] = parseReading("a *soft turn* and **firm** end *open");
    expect(b.words.map((w) => [w.text, w.bold, w.italic])).toEqual([
      ["a", false, false], ["soft", false, true], ["turn", false, true], ["and", false, false],
      ["firm", true, false], ["end", false, false], ["open", false, true],
    ]);
  });

  it("turns --- and *** lines into rule blocks with no words", () => {
    const blocks = parseReading("Before\n\n---\n\nMiddle\n***\nAfter");
    expect(blocks.map((b) => (b.rule ? "rule" : b.words.map((w) => w.text).join(" ")))).toEqual([
      "Before", "rule", "Middle", "rule", "After",
    ]);
    expect(blocks.filter((b) => b.rule).every((b) => b.words.length === 0)).toBe(true);
  });
});
