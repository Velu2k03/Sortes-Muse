// UX audit Phase 2, F03 + F04 (2026-11-16): the hero is ONE fixed
// headline, Velu's own from his 2026-11-15 landing choices (choice
// 11): "Ask one honest question. Draw one clear card." The rotation
// among four variants is deleted. A brand says one thing, the same
// way, every visit (101, "Strive for Simplicity"; Jakob's Law). The
// subhead names tarot in one short line (F04, 5-second test), and the
// single CTA is the gold submit button (F05). The old variants B-D
// and the random picker are gone, not kept as dead data. History:
// rotation was a deliberate Velu decision (PR #97, extended PR #100);
// the audit he ordered judged the outcome, and this fix follows it.
export const HERO_COPY = {
  h1: "Ask one honest question. Draw one clear card.",
  h2: "A personal tarot reading for the question on your mind.",
  primaryCta: "Draw Your Card",
} as const;
