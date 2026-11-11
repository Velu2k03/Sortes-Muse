import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Batch 10: animated wait screen (Motion version, Velu approved).
// The wait during reading generation was mostly text. Now the drawn
// cards show at the top of the wait screen, dealt in with the Batch 8
// deal-in, flipping to reveal (TarotCard fires the gold CardBurst on
// reveal), and the row gently floats while the reading generates.
// Motion only, no video file, no new library.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Batch 10: animated wait screen", () => {
  it("WaitDeck exists and reuses TarotCard + Motion + the Batch 8 deal-in", () => {
    const deck = src("src/components/WaitDeck.tsx");
    expect(deck).toContain("TarotCard");
    expect(deck).toContain('from "motion/react"');
    expect(deck).toContain("revealed");
    // Batch 8 deal-in values (from above, scale, deterministic rotation).
    expect(deck).toContain("y: -48");
    expect(deck).toContain("scale: 1.12");
    expect(deck).toContain("((i * 7) % 11) - 5");
    expect(deck).toContain("i * 0.1");
  });

  it("WaitDeck respects reduced motion (no deal-in, no float)", () => {
    const deck = src("src/components/WaitDeck.tsx");
    expect(deck).toContain("useReducedMotion");
    expect(deck).toContain("reduceMotion");
  });

  it("WaitDeck adds no new animation library (Motion only)", () => {
    const deck = src("src/components/WaitDeck.tsx");
    expect(deck).not.toContain("gsap");
    expect(deck).not.toContain("react-spring");
    expect(deck).not.toContain("<video");
    expect(deck).not.toContain("<audio");
  });

  it("ReadingWait renders the deck when drawn cards are passed", () => {
    const wait = src("src/components/ReadingWait.tsx");
    expect(wait).toContain("WaitDeck");
    expect(wait).toContain("drawnCards");
  });

  it("ProcessingStage passes the drawn cards through to ReadingWait", () => {
    const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
    expect(steps).toContain("drawnCards");
    expect(steps).toContain("<ReadingWait activeStep={activeStep} complete={complete} drawnCards={drawnCards} />");
  });

  it("IntakeFlow passes drawnCards to ProcessingStage", () => {
    const flow = src("src/app/intake/[slug]/IntakeFlow.tsx");
    expect(flow).toContain("drawnCards={drawnCards}");
  });

  it("the wait screen keeps its status lines, loader and streamed text", () => {
    const wait = src("src/components/ReadingWait.tsx");
    expect(wait).toContain("PROCESSING_LINES");
    expect(wait).toContain("LatticeLoader");
    const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
    expect(steps).toContain("ReadingText text={streamedText}");
  });
});
