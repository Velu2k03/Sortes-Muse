import cardsData from "@/data/cards.json";
import type { TarotCard } from "./types";

export const CARDS: TarotCard[] = cardsData as TarotCard[];

const byId = new Map(CARDS.map((c) => [c.id, c]));

export function getCard(id: string): TarotCard {
  const card = byId.get(id);
  if (!card) throw new Error(`Unknown card id: ${id}`);
  return card;
}

export const MAJORS = CARDS.filter((c) => c.arcana === "major");
export const MINORS = CARDS.filter((c) => c.arcana === "minor");

// Phase 4A (4.4): the per-card route slug, from the card name:
// "The Fool" -> "the-fool", "Ace of Wands" -> "ace-of-wands".
// Verified against src/data/cards.json: all 78 names slugify to
// unique, non-empty slugs (pinned by src/lib/__tests__/deck.test.ts).
export function cardSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const bySlug = new Map(CARDS.map((c) => [cardSlug(c.name), c]));

export function getCardBySlug(slug: string): TarotCard | undefined {
  return bySlug.get(slug);
}

// Classical suit -> element mapping, for the card detail page.
// Major Arcana cards have no suit, so no element.
export function suitElement(
  suit: TarotCard["suit"],
): "Fire" | "Water" | "Air" | "Earth" | undefined {
  const map = {
    wands: "Fire",
    cups: "Water",
    swords: "Air",
    pentacles: "Earth",
  } as const;
  return suit ? map[suit] : undefined;
}

// Phase 4A (4.4): the card grid was the default deck view; the spiral
// gallery is opt-in. Batch 5 adds a List view (one text row per card,
// the most keyboard- and screen-reader-friendly view) and makes it
// the default. Under prefers-reduced-motion the spiral is never
// shown, whatever was requested; it falls back to the default (list).
// Grid and list are static, so an explicit choice of either is kept.
export type DeckView = "grid" | "list" | "spiral";
export const DEFAULT_DECK_VIEW: DeckView = "list";

export function resolveDeckView(
  requested: DeckView,
  reducedMotion: boolean,
): DeckView {
  return reducedMotion && requested === "spiral" ? "list" : requested;
}

export const SUITS = ["wands", "cups", "swords", "pentacles"] as const;

export function cardsBySuit(suit: string): TarotCard[] {
  return MINORS.filter((c) => c.suit === suit);
}

export function suitLabel(suit: string): string {
  return suit.charAt(0).toUpperCase() + suit.slice(1);
}

export type DeckFilter = "all" | "major" | "wands" | "cups" | "swords" | "pentacles";
const DECK_FILTERS: readonly DeckFilter[] = ["all", "major", "wands", "cups", "swords", "pentacles"];

// URL param -> a valid filter; anything missing or unknown is "all".
export function resolveDeckFilter(value: string | string[] | undefined): DeckFilter {
  const v = Array.isArray(value) ? value[0] : value;
  return DECK_FILTERS.find((f) => f === v) ?? "all";
}

export function filterDeckCards(filter: DeckFilter, query: string): TarotCard[] {
  let list = CARDS;
  if (filter === "major") list = MAJORS;
  else if (filter !== "all") list = cardsBySuit(filter);
  const q = query.trim().toLowerCase();
  return q ? list.filter((c) => c.name.toLowerCase().includes(q)) : list;
}

export function orientationKeywords(card: TarotCard, reversed: boolean): string[] {
  return reversed ? card.keywords.reversed : card.keywords.upright;
}

export function orientationMeaning(card: TarotCard, reversed: boolean): string {
  return reversed ? card.meaning.reversed : card.meaning.upright;
}
