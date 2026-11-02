import { CARDS } from "./cards";
import type { DrawnCard, Spread } from "./types";

export const CARD_BACK = "/cards/card-back.jpg";

export const SPREADS: Spread[] = [
  {
    slug: "quick-insight",
    name: "Quick Insight",
    cards: 1,
    price: 0.99,
    description:
      "One card, one clear mirror. Your first full reading is free, no card required.",
    positions: [
      {
        key: "insight",
        label: "Insight",
        hint: "The heart of the matter right now",
      },
    ],
    locked: false,
  },
  {
    slug: "past-present-future",
    name: "Past / Present / Future",
    cards: 3,
    price: 1.99,
    description:
      "Three cards tracing where you have been, where you stand, and where the path leads.",
    positions: [
      { key: "past", label: "Past", hint: "What shaped this moment" },
      { key: "present", label: "Present", hint: "Where you stand now" },
      { key: "future", label: "Future", hint: "Where the path may lead" },
    ],
    locked: true,
  },
  {
    slug: "love-insight",
    name: "Love Insight",
    cards: 3,
    price: 1.99,
    description:
      "Three cards for a relationship question. You, the other person, and what connects you.",
    positions: [
      { key: "you", label: "You", hint: "Where you stand in this" },
      { key: "them", label: "Them", hint: "Where the other person stands" },
      { key: "connection", label: "Connection", hint: "What connects you, or what needs attention" },
    ],
    locked: true,
  },
  {
    slug: "career-path",
    name: "Career Path",
    cards: 3,
    price: 1.99,
    description:
      "Three cards for a work question. Where you stand, what is in the way, and the next step.",
    positions: [
      { key: "current", label: "Current", hint: "Where your work stands now" },
      { key: "obstacle", label: "Obstacle", hint: "What is in the way" },
      { key: "next", label: "Next Step", hint: "The step to take next" },
    ],
    locked: true,
  },
  {
    slug: "weekly-outlook",
    name: "Weekly Outlook",
    cards: 3,
    price: 1.99,
    description:
      "Three cards for the week ahead. A focus, a challenge, and an opportunity.",
    positions: [
      { key: "focus", label: "Focus", hint: "What deserves your attention this week" },
      { key: "challenge", label: "Challenge", hint: "What may test you this week" },
      { key: "opportunity", label: "Opportunity", hint: "What is open to you this week" },
    ],
    locked: true,
  },
  {
    slug: "celtic-cross",
    name: "Celtic Cross",
    cards: 10,
    price: 2.99,
    description:
      "The classic ten-card spread. The full landscape: forces, hopes, and outcome.",
    positions: [
      { key: "present", label: "Present", hint: "The heart of the matter" },
      { key: "challenge", label: "Challenge", hint: "What crosses you" },
      { key: "past", label: "Past", hint: "The foundation behind you" },
      { key: "future", label: "Future", hint: "What is approaching" },
      { key: "above", label: "Above", hint: "Your goal or best outcome" },
      { key: "below", label: "Below", hint: "The deeper foundation" },
      { key: "advice", label: "Advice", hint: "How to approach it" },
      { key: "external", label: "External", hint: "Outside influences" },
      { key: "hopes", label: "Hopes & Fears", hint: "What you hope for or dread" },
      { key: "outcome", label: "Outcome", hint: "Where this is heading" },
    ],
    locked: true,
  },
];

export function getSpread(slug: string): Spread {
  const spread = SPREADS.find((s) => s.slug === slug);
  if (!spread) throw new Error(`Unknown spread: ${slug}`);
  return spread;
}

export function shuffleDeck(): string[] {
  const ids = CARDS.map((c) => c.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

export function drawCards(spread: Spread, deck?: string[]): DrawnCard[] {
  const ids = deck ?? shuffleDeck();
  return spread.positions.map((pos, i) => ({
    cardId: ids[i % ids.length],
    reversed: Math.random() < 0.2,
    position: pos.label,
    positionKey: pos.key,
  }));
}

export function drawSingle(excludeIds: string[] = []): DrawnCard {
  const pool = CARDS.filter((c) => !excludeIds.includes(c.id));
  const card = pool[Math.floor(Math.random() * pool.length)];
  return {
    cardId: card.id,
    reversed: Math.random() < 0.2,
    position: "Daily Card",
    positionKey: "daily",
  };
}
