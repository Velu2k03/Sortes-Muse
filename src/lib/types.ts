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
  // M1.1: the question as first written, when the confirm-step rewrite
  // changed it; the first word the seeker gave for their reaction to
  // the drawn cards; and the one next step they chose after reading.
  originalQuestion?: string;
  firstImpression?: string;
  nextStep?: string;
  firstName?: string;
  free: boolean;
  // M2.1: follow-up thread on this reading (tarot only, cap 3).
  followUps?: FollowUp[];
  // M2.2: 7-day revisit note, saved on the reading itself.
  revisitNote?: string;
  revisitAt?: string;
  // Chart readings only: a positions-only summary, never birth data.
  chartSummary?: string;
}

// M2.1: one follow-up exchange within a reading thread.
export interface FollowUp {
  question: string;
  answer: string;
  createdAt: string;
  free: boolean;
}
