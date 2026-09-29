export interface CardKeywords {
  upright: string[];
  reversed: string[];
}

export interface CardMeaning {
  upright: string;
  reversed: string;
}

export interface TarotCard {
  id: string;
  name: string;
  arcana: "major" | "minor";
  suit: "wands" | "cups" | "swords" | "pentacles" | null;
  number: number;
  keywords: CardKeywords;
  meaning: CardMeaning;
  image: string;
}

export interface SpreadPosition {
  key: string;
  label: string;
  hint: string;
}

export interface Spread {
  slug: string;
  name: string;
  cards: number;
  price: number;
  description: string;
  positions: SpreadPosition[];
  locked: boolean;
}

export interface DrawnCard {
  cardId: string;
  reversed: boolean;
  position: string;
  positionKey: string;
}

export interface Reading {
  id: string;
  createdAt: string;
  spreadSlug: string;
  spreadName: string;
  cards: DrawnCard[];
  interpretation: string | null;
  aiGenerated: boolean;
  category?: string;
  question?: string;
  firstName?: string;
  free: boolean;
}
