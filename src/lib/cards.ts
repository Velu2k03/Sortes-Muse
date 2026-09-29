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

export const SUITS = ["wands", "cups", "swords", "pentacles"] as const;

export function cardsBySuit(suit: string): TarotCard[] {
  return MINORS.filter((c) => c.suit === suit);
}

export function suitLabel(suit: string): string {
  return suit.charAt(0).toUpperCase() + suit.slice(1);
}

export function orientationKeywords(card: TarotCard, reversed: boolean): string[] {
  return reversed ? card.keywords.reversed : card.keywords.upright;
}

export function orientationMeaning(card: TarotCard, reversed: boolean): string {
  return reversed ? card.meaning.reversed : card.meaning.upright;
}
