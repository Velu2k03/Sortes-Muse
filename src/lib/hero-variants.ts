// Hero copy rotation (Velu, 2026-11-15): the hero H1, subhead, and
// CTA labels rotate randomly among the variants on each page load,
// not one fixed version. Velu's exact words, used verbatim. His
// landing headline "Ask one honest question. Draw one clear card."
// (2026-11-15 23:16) is variant A (index 0), so it renders on the
// server and on first paint, then rotates with the rest. The
// rotation is KEPT by his 2026-11-15 23:26 decision ("keep the
// rotates!"). The "Sortes - Get Answers to the Questions on Your
// Mind" H1 line he also listed has no H2/CTA of its own, so it is
// NOT one of the rotating variants. Landing design stays Design 1,
// Ask First (question box hero); only the copy rotates, the layout
// and the question box stay the same. The title tag ("Sortes | AI
// Tarot Reading Online") is metadata, not the H1, and does not
// change.

export type HeroVariant = {
  h1: string;
  h2: string;
  primaryCta: string;
  secondaryCta: string;
};

export const HERO_VARIANTS: HeroVariant[] = [
  {
    h1: "Ask one honest question. Draw one clear card.",
    h2: "Get a clear, personal reading for the question on your mind.",
    primaryCta: "Draw Your Card",
    secondaryCta: "Explore Readings",
  },
  {
    h1: "Sortes – Find New Clarity About Your Life",
    h2: "Love, relationships, and the questions that matter.",
    primaryCta: "Find Your Clarity",
    secondaryCta: "Discover Readings",
  },
  {
    h1: "Sortes – Find Clarity When Life Feels Uncertain",
    h2: "Love, life, and the choices ahead.",
    primaryCta: "Begin Your Reading",
    secondaryCta: "Explore Your Options",
  },
  {
    h1: "Sortes – Discover What Your Future Could Hold",
    h2: "Love, life, relationships, and the choices ahead.",
    primaryCta: "Discover Your Future",
    secondaryCta: "Explore Readings",
  },
];

// The page is server-rendered, so the hero renders variant A (index
// 0) on the server and on first paint, then picks a random variant
// in a useEffect after mount. A random pick during render would
// disagree between server and client (hydration mismatch).
export function randomHeroVariantIndex(): number {
  return Math.floor(Math.random() * HERO_VARIANTS.length);
}
