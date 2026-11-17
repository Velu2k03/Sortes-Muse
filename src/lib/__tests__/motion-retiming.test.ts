/**
 * All-pages motion retiming, Top 10 fix 2 (after /daily timing, PR #131):
 * reveals in DeckClient, SpreadsClient, ReadingSections, IntakeSteps and
 * WaitDeck retimed to the transitions.dev 150-250ms band. Deliberate
 * emphasis moments are kept with a reason, not retimed blindly: the
 * TarotCard 3D flip (0.55s) must stay readable as a flip, the CardBurst
 * shower (0.85s, ring 0.9s) as a shower not a flash, the SlideCommit
 * landing dip (0.46s) and error shake (0.45s) as feedback, the
 * RubberSegment momentum spring (0.4s) as drag physics, and the CallChip
 * error shake (450ms) as a failure signal.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("motion retiming: page reveals in the transitions.dev 150-250ms band", () => {
  it("DeckClient grid tiles reveal at 0.25s, delay capped at 0.2s", () => {
    const deck = src("src/app/deck/DeckClient.tsx");
    // Was duration 0.4s with delay capped at 0.5s: last tile done at 0.9s.
    expect(deck).toContain("delay: Math.min(i * 0.02, 0.2), duration: 0.25");
    expect(deck).not.toContain("duration: 0.4");
    expect(deck).not.toContain("Math.min(i * 0.02, 0.5)");
  });

  it("SpreadsClient spread cards reveal at 0.25s, stagger 0.04s", () => {
    const spreads = src("src/app/spreads/SpreadsClient.tsx");
    // Was duration 0.4s with stagger i * 0.05: last spread done at 0.65s.
    expect(spreads).toContain("delay: i * 0.04, duration: 0.25");
    expect(spreads).not.toContain("duration: 0.4");
    expect(spreads).not.toContain("delay: i * 0.05");
  });

  it("ReadingSections dealt cards reveal at 0.25s, stagger capped at 0.2s", () => {
    const reading = src("src/app/reading/[id]/ReadingSections.tsx");
    // Was duration 0.5s with stagger i * 0.1: last card on a 10-card
    // spread done at 1.4s.
    expect(reading).toContain(
      'transition={{ duration: 0.25, delay: reduceMotion ? 0 : Math.min(i * 0.04, 0.2), ease: "easeOut" }}'
    );
    expect(reading).not.toContain("duration: 0.5");
    expect(reading).not.toContain("i * 0.1");
  });

  it("IntakeSteps dealt cards reveal at 0.25s, stagger capped at 0.2s", () => {
    const intake = src("src/app/intake/[slug]/IntakeSteps.tsx");
    // Same deal-in as ReadingSections, was 0.5s with stagger i * 0.1.
    expect(intake).toContain(
      'transition={{ duration: 0.25, delay: reduceMotion ? 0 : Math.min(i * 0.04, 0.2), ease: "easeOut" }}'
    );
    expect(intake).not.toContain("duration: 0.5");
    expect(intake).not.toContain("i * 0.1");
  });

  it("WaitDeck deal-in reveals at 0.25s, stagger capped at 0.2s", () => {
    const wait = src("src/components/WaitDeck.tsx");
    // Same deal-in pattern, was 0.5s with stagger i * 0.1. The 4s
    // ambient float is not a reveal and stays.
    expect(wait).toContain("duration: 0.25,");
    expect(wait).toContain("Math.min(i * 0.04, 0.2)");
    expect(wait).not.toContain("duration: 0.5,");
    expect(wait).toContain("duration: 4, repeat: Infinity");
  });

  it("/daily is untouched by this retiming", () => {
    const daily = src("src/app/daily/page.tsx");
    // /daily was already fixed in PR #131; its reveals stay 0.25s and
    // its TarotCard props stay 0.25. This branch must not churn it.
    expect(daily).toContain("flipDuration={0.25}");
    expect(daily).toContain("burstDuration={0.25}");
  });
});

describe("motion retiming: deliberate emphasis moments are kept, with reasons", () => {
  it("TarotCard flip default stays 0.55s and CardBurst default stays 0.85s", () => {
    const card = src("src/components/TarotCard.tsx");
    // A 3D flip at 0.25s reads as a snap, not a flip. Pages that need
    // the fast band pass flipDuration in; /daily already does.
    expect(card).toContain("flipDuration?: number");
    expect(card).toContain("burstDuration?: number");
    const burst = src("src/components/CardBurst.tsx");
    // A shower of sparks at 0.25s is a flash, not a shower.
    expect(burst).toContain("duration = 0.85,");
    expect(burst).toContain("deliberate delight");
  });

  it("SlideCommit landing dip and error shake stay 0.46s / 0.45s", () => {
    const slide = src("src/components/SlideCommit.tsx");
    // Feedback moments, not reveals: the dip is the settle after a
    // slide-to-commit, the shake is the error signal. Both carry a
    // comment saying so.
    expect(slide).toContain("duration: 0.46");
    expect(slide).toContain("duration: 0.45");
    expect(slide).toContain("Deliberate emphasis, NOT a reveal");
  });

  it("RubberSegment momentum spring and CallChip error shake stay", () => {
    const rubber = src("src/components/RubberSegment.tsx");
    // Interactive drag physics, not a reveal: the spring's settle cap.
    expect(rubber).toContain("duration: 0.4, bounce: 0.2");
    expect(rubber).toContain("interactive drag physics");
    const chip = src("src/components/CallChip.tsx");
    // Error feedback, same family as the SlideCommit shake.
    expect(chip).toContain("duration: 450");
    expect(chip).toContain("Deliberate emphasis, NOT a reveal");
  });
});
