import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Batch 8: the catalogue animations (from the 20 links Velu gave).
// The deal-in is enhanced with a random rotation and a scale (gist
// djD-REK), and TarotCard lifts on hover (Mystic-Draw scale 1.05).
// Fan-out + manual pick, flick, sound, and the denser particle
// background are DEFERRED (product changes, need Velu's decision).
// No flow, pricing, or copy changes.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

// The deterministic per-index rotation, mirroring the inline
// expression ((i * 7) % 11) - 5 used in both deal-in rows.
const dealRotation = (i: number) => ((i * 7) % 11) - 5;

describe("Batch 8: catalogue animations", () => {
  it("the deal-in rotation is deterministic and stays in -5..+5deg", () => {
    for (let i = 0; i < 30; i++) {
      const r = dealRotation(i);
      expect(r).toBeGreaterThanOrEqual(-5);
      expect(r).toBeLessThanOrEqual(5);
    }
    // Stable across renders: same index, same rotation.
    expect(dealRotation(0)).toBe(-5);
    expect(dealRotation(1)).toBe(2);
    expect(dealRotation(2)).toBe(-2);
    expect(dealRotation(3)).toBe(5);
  });

  it("both deal-in rows use the rotation, scale, and 100ms stagger", () => {
    for (const rel of [
      "src/app/reading/[id]/ReadingSections.tsx",
      "src/app/intake/[slug]/IntakeSteps.tsx",
    ]) {
      const file = src(rel);
      expect(file).toContain("rotate: ((i * 7) % 11) - 5");
      expect(file).toContain("y: -48, scale: 1.12");
      expect(file).toContain("delay: reduceMotion ? 0 : i * 0.1");
      expect(file).toContain("duration: 0.5");
      expect(file).toContain("animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}");
    }
  });

  it("TarotCard lifts to 1.05 on hover (interactive, not reduced motion)", () => {
    const card = src("src/components/TarotCard.tsx");
    expect(card).toContain("whileHover={interactive && !reducedMotion ? { scale: 1.05 } : undefined}");
  });

  it("no product change: no manual pick, no sound, no new animation library", () => {
    // The spread still routes through the intake (no manual pick).
    const flow = src("src/components/ReadingFlow.tsx");
    expect(flow).toContain("/intake/${spread.slug}");
    // No audio element and no new animation library in TarotCard.
    const card = src("src/components/TarotCard.tsx");
    expect(card).not.toContain("<audio");
    expect(card).not.toContain("gsap");
    expect(card).not.toContain("react-spring");
    // The flip, tilt, bloom, burst, and sheen are untouched.
    expect(card).toContain("rotateY: revealed ? 180 : 0");
    expect(card).toContain("Golden bloom");
    expect(card).toContain("card-back-sheen");
    expect(card).toContain("{revealed && !reducedMotion && <CardBurst />}");
  });
});
