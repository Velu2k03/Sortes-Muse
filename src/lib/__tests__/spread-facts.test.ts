import { describe, expect, it } from "vitest";
import { computeSpreadFacts, type FactCard } from "@/lib/spread-facts";

function card(
  cardId: string,
  name: string,
  suit: string | null,
  number: number,
  arcana: "major" | "minor" = "minor"
): FactCard {
  return { cardId, name, reversed: false, position: "Past", arcana, suit, number };
}

describe("computeSpreadFacts — all tension pairs and suit distribution", () => {
  it("reports every conflicting elemental pair, not just the first", () => {
    const facts = computeSpreadFacts([
      card("wands-01", "Ace of Wands", "wands", 1),
      card("cups-01", "Ace of Cups", "cups", 1),
      card("swords-01", "Ace of Swords", "swords", 1),
      card("pentacles-01", "Ace of Pentacles", "pentacles", 1),
    ]);
    // Fire vs Water and Air vs Earth both conflict.
    expect(facts.tensionPairs).toHaveLength(2);
    expect(facts.tensionPairs[0]).toEqual({
      a: "Ace of Wands",
      aElement: "Fire",
      b: "Ace of Cups",
      bElement: "Water",
    });
    expect(facts.tensionPairs[1]).toEqual({
      a: "Ace of Swords",
      aElement: "Air",
      b: "Ace of Pentacles",
      bElement: "Earth",
    });
    // The first pair is still exposed under the old name.
    expect(facts.tensionPair).toEqual(facts.tensionPairs[0]);
    expect(facts.summary).toContain("Ace of Wands (Fire) pulls against Ace of Cups (Water)");
    expect(facts.summary).toContain("Ace of Swords (Air) pulls against Ace of Pentacles (Earth)");
  });

  it("reports the suit distribution across all four suits", () => {
    const facts = computeSpreadFacts([
      card("wands-01", "Ace of Wands", "wands", 1),
      card("wands-02", "Two of Wands", "wands", 2),
      card("cups-01", "Ace of Cups", "cups", 1),
      card("major-00", "The Fool", null, 0, "major"),
    ]);
    expect(facts.suitDistribution).toEqual([
      { suit: "wands", count: 2 },
      { suit: "cups", count: 1 },
      { suit: "swords", count: 0 },
      { suit: "pentacles", count: 0 },
    ]);
    expect(facts.summary).toContain("Suits: wands 2, cups 1, swords 0, pentacles 0.");
    expect(facts.dominantSuit).toBe("wands");
  });

  it("reports no tension pair and an empty distribution for a single major", () => {
    const facts = computeSpreadFacts([card("major-00", "The Fool", null, 0, "major")]);
    expect(facts.tensionPairs).toEqual([]);
    expect(facts.tensionPair).toBeNull();
    expect(facts.suitDistribution).toEqual([
      { suit: "wands", count: 0 },
      { suit: "cups", count: 0 },
      { suit: "swords", count: 0 },
      { suit: "pentacles", count: 0 },
    ]);
  });
});
