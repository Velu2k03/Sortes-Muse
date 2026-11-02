// Computed spread facts: deterministic observations about a draw, used
// to ground AI interpretations in the actual cards instead of letting
// the model invent relationships. Pure functions, no I/O, so they can
// be unit-tested directly. The input cards must already be resolved
// against the deck (name, arcana, suit, number); this module never
// reads cards.json itself, which keeps it free of deck assumptions
// beyond the shapes below.

export type FactCard = {
  cardId: string;
  name: string;
  reversed: boolean;
  position: string;
  arcana: "major" | "minor";
  suit: string | null;
  number: number;
};

export const SUIT_ELEMENTS: Record<string, string> = {
  wands: "Fire",
  cups: "Water",
  swords: "Air",
  pentacles: "Earth",
};

// Element pairs that argue with each other in traditional elemental
// dignities. Fire and Water weaken each other; Air and Earth do the same.
const CONFLICTS: Record<string, string> = {
  Fire: "Water",
  Water: "Fire",
  Air: "Earth",
  Earth: "Air",
};

export type SpreadFacts = {
  dominantSuit: string | null;
  dominantElement: string | null;
  dominantCount: number;
  totalMinors: number;
  courtCount: number;
  reversalCount: number;
  repeatedNumbers: Array<{ number: number; count: number; names: string[] }>;
  tensionPair: { a: string; aElement: string; b: string; bElement: string } | null;
  summary: string;
};

function elementOf(card: FactCard): string | null {
  if (card.arcana !== "minor" || !card.suit) return null;
  return SUIT_ELEMENTS[card.suit] ?? null;
}

export function computeSpreadFacts(cards: FactCard[]): SpreadFacts {
  const minors = cards.filter((c) => c.arcana === "minor");
  const suitCounts = new Map<string, number>();
  const suitFirstIndex = new Map<string, number>();
  minors.forEach((c, i) => {
    if (!c.suit) return;
    suitCounts.set(c.suit, (suitCounts.get(c.suit) ?? 0) + 1);
    if (!suitFirstIndex.has(c.suit)) suitFirstIndex.set(c.suit, i);
  });
  // Highest count wins; ties break by earliest draw position, so the
  // result is deterministic for a given draw order.
  let dominantSuit: string | null = null;
  let dominantCount = 0;
  for (const [suit, count] of suitCounts) {
    if (
      count > dominantCount ||
      (count === dominantCount &&
        dominantSuit !== null &&
        (suitFirstIndex.get(suit) ?? 0) < (suitFirstIndex.get(dominantSuit) ?? 0))
    ) {
      dominantSuit = suit;
      dominantCount = count;
    }
  }
  const dominantElement = dominantSuit ? (SUIT_ELEMENTS[dominantSuit] ?? null) : null;

  // Courts are minors numbered 11 to 14 (Page, Knight, Queen, King).
  const courtCount = minors.filter((c) => c.number >= 11).length;
  const reversalCount = cards.filter((c) => c.reversed).length;

  // Repeated numbers group by number value across both arcana: a
  // Magician (1) and an Ace (1) share the number 1. Only groups of 2+
  // are reported, in first-appearance order.
  const byNumber = new Map<number, string[]>();
  for (const c of cards) {
    const list = byNumber.get(c.number) ?? [];
    list.push(c.name);
    byNumber.set(c.number, list);
  }
  const repeatedNumbers = [...byNumber.entries()]
    .filter(([, names]) => names.length >= 2)
    .map(([number, names]) => ({ number, count: names.length, names }));

  // Tension pair: the first pair in draw order whose elements conflict.
  let tensionPair: SpreadFacts["tensionPair"] = null;
  outer: for (let i = 0; i < cards.length; i++) {
    const ei = elementOf(cards[i]);
    if (!ei) continue;
    for (let j = i + 1; j < cards.length; j++) {
      const ej = elementOf(cards[j]);
      if (ej && CONFLICTS[ei] === ej) {
        tensionPair = { a: cards[i].name, aElement: ei, b: cards[j].name, bElement: ej };
        break outer;
      }
    }
  }

  const parts: string[] = [];
  if (dominantSuit && dominantElement) {
    parts.push(
      `Dominant suit: ${dominantSuit} (${dominantElement}, ${dominantCount} of ${cards.length} cards).`
    );
  } else if (cards.length === 1) {
    parts.push("Single card draw: no dominant suit.");
  } else {
    parts.push("No dominant suit: the suits are evenly spread.");
  }
  if (courtCount > 0) parts.push(`Court cards: ${courtCount}.`);
  if (reversalCount > 0) parts.push(`Reversed cards: ${reversalCount}.`);
  for (const r of repeatedNumbers) {
    parts.push(`Repeated number ${r.number} (${r.count} cards: ${r.names.join(", ")}).`);
  }
  if (tensionPair) {
    parts.push(
      `Tension pair: ${tensionPair.a} (${tensionPair.aElement}) pulls against ${tensionPair.b} (${tensionPair.bElement}).`
    );
  }
  return {
    dominantSuit,
    dominantElement,
    dominantCount,
    totalMinors: minors.length,
    courtCount,
    reversalCount,
    repeatedNumbers,
    tensionPair,
    summary: parts.join(" "),
  };
}
