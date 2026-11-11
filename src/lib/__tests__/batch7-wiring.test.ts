import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Batch 7: the magical effects. The card reveal (3D flip, golden
// bloom, CardBurst sparks) already existed in TarotCard, but the
// burst NEVER fired: no parent passed `celebrate`. This batch wires
// it up (TarotCard auto-fires the burst once on reveal) and deals
// the cards in with a stagger on the reading page and the intake
// impression step, so the spread feels dealt rather than pasted.
// Everything is skipped for reduced motion. No flow, pricing, or
// copy changes.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Batch 7: magical effects", () => {
  it("TarotCard fires the burst the moment the card is revealed", () => {
    const card = src("src/components/TarotCard.tsx");
    // The burst renders whenever the card is revealed (and not
    // reduced motion). CardBurst animates once on mount.
    expect(card).toContain("{revealed && !reducedMotion && <CardBurst />}");
    expect(card).toContain("<CardBurst />");
    // The old `celebrate` prop (never passed by any parent) is gone:
    // no such field in Props and no such default in the destructuring.
    expect(card).not.toContain("celebrate?: boolean");
    expect(card).not.toContain("celebrate = false");
  });

  it("the burst is skipped for reduced motion", () => {
    const card = src("src/components/TarotCard.tsx");
    expect(card).toContain("!reducedMotion && <CardBurst />");
  });

  it("the reading page deals the cards in with a stagger (Batch 8 enhanced it)", () => {
    const sections = src("src/app/reading/[id]/ReadingSections.tsx");
    expect(sections).toContain("useReducedMotion");
    expect(sections).toContain("reading.cards.map((d, i) =>");
    expect(sections).toContain("delay: reduceMotion ? 0 : i * 0.1");
    expect(sections).toContain("initial={reduceMotion ? false : { opacity: 0, y: -48, scale: 1.12, rotate: ((i * 7) % 11) - 5 }}");
    expect(sections).toContain("animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}");
  });

  it("the intake impression step deals the cards in with a stagger (Batch 8 enhanced it)", () => {
    const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
    expect(steps).toContain("drawnCards.map((d, i) =>");
    expect(steps).toContain("delay: reduceMotion ? 0 : i * 0.1");
    expect(steps).toContain("initial={reduceMotion ? false : { opacity: 0, y: -48, scale: 1.12, rotate: ((i * 7) % 11) - 5 }}");
    expect(steps).toContain("animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}");
  });

  it("no flow, pricing, or copy changed", () => {
    // TarotCard keeps its flip, tilt, bloom, and sheen.
    const card = src("src/components/TarotCard.tsx");
    expect(card).toContain("rotateY: revealed ? 180 : 0");
    expect(card).toContain("Golden bloom");
    expect(card).toContain("card-back-sheen");
    // The spread still routes through the intake (no manual pick).
    const flow = src("src/components/ReadingFlow.tsx");
    expect(flow).toContain("/intake/${spread.slug}");
  });
});
