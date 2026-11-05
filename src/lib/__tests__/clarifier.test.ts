import { describe, it, expect } from "vitest";
import { drawClarifierCard } from "@/lib/clarifier";

const DECK = ["a", "b", "c", "d", "e"];

describe("drawClarifierCard", () => {
  it("never draws a card already in the spread", () => {
    for (let i = 0; i < 50; i++) {
      const drawn = drawClarifierCard(["a", "b", "c"], DECK);
      expect(["d", "e"]).toContain(drawn);
    }
  });

  it("draws uniformly from the remaining deck (seeded random picks each slot)", () => {
    expect(drawClarifierCard(["a", "b"], DECK, () => 0)).toBe("c");
    expect(drawClarifierCard(["a", "b"], DECK, () => 0.5)).toBe("d");
    expect(drawClarifierCard(["a", "b"], DECK, () => 0.999)).toBe("e");
  });

  it("returns null when the whole deck is already in the spread", () => {
    expect(drawClarifierCard(DECK, DECK)).toBeNull();
    expect(drawClarifierCard([], [])).toBeNull();
  });

  it("draws from the full deck when the spread is empty", () => {
    expect(drawClarifierCard([], DECK, () => 0)).toBe("a");
  });

  it("ignores excluded ids that are not in the deck", () => {
    expect(drawClarifierCard(["zzz"], DECK, () => 0)).toBe("a");
  });
});
