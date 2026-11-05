// Phase 5 (5.3): clarifier card draw for reading follow-ups. One
// real card drawn server-side from the cards NOT already in the
// reading's spread, uniformly at random. Pure function: the caller
// supplies the deck ids (the route passes the 78-card deck) and an
// optional random source, so tests can seed it. Returns null only
// when no card remains, which cannot happen for a real spread
// (spreads draw at most 20 of 78 cards).

export function drawClarifierCard(
  spreadCardIds: Iterable<string>,
  deckCardIds: string[],
  random: () => number = Math.random
): string | null {
  const excluded = new Set(spreadCardIds);
  const remaining = deckCardIds.filter((id) => !excluded.has(id));
  if (remaining.length === 0) return null;
  return remaining[Math.floor(random() * remaining.length)];
}
