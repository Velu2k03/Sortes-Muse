/**
 * UX audit Phase 2, F20-F22 (intake).
 * F20: the step H1 is focused programmatically so a screen reader
 * announces the step; it must not show a focus ring, or it reads as
 * a text input. F21: 5 category cards in a 2-column grid orphaned
 * the last one alone on row 3. F22: two card taglines restated the
 * title or were mystical padding; each must carry a fact.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("F20 intake heading is not a text input", () => {
  it("every programmatically focused heading uses outline-none! (the ! is load-bearing)", () => {
    const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
    // The global unlayered :focus-visible rule in globals.css beats
    // Tailwind's layered outline-none, so plain outline-none still
    // draws the gold box. The trailing ! (Tailwind v4 important)
    // makes the suppression win.
    const focused = steps.match(/tabIndex=\{-1\}[^>]*outline-none!?/g) ?? [];
    // Batch 1 (S1): SupportStep is the sixth focused step wrapper.
    expect(focused.length).toBe(6);
    for (const el of focused) {
      expect(el).toContain("outline-none!");
    }
    expect(steps).not.toMatch(/tabIndex=\{-1\}[^>]*outline-none"/);
    expect(steps).toContain("UX audit Phase 2, F20");
  });

  it("the global focus ring still exists for interactive elements", () => {
    const css = src("src/app/globals.css");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("outline: 2px solid var(--color-goldbright)");
  });
});

describe("F21 last category card is centered, not orphaned", () => {
  it("the last card spans both columns and centers at half width", () => {
    const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
    expect(steps).toContain("sm:col-span-2 sm:mx-auto sm:w-1/2");
    expect(steps).toContain("i === INTAKE_CATEGORIES.length - 1");
    expect(steps).toContain("UX audit Phase 2, F21");
  });
});

describe("F22 card taglines carry a fact, not a restatement", () => {
  it("love and finances taglines name what the reading asks about", () => {
    const intake = src("src/lib/intake.ts");
    expect(intake).toContain('tagline: "You, them, and where things stand."');
    expect(intake).toContain('tagline: "Income, goals, and the struggle."');
    expect(intake).not.toContain("Relationships and connection.");
    expect(intake).not.toContain("Clarity around resources and flow.");
  });

  it("the other three taglines already carry facts and stay", () => {
    const intake = src("src/lib/intake.ts");
    expect(intake).toContain('tagline: "Direction, purpose, and the next move."');
    expect(intake).toContain('tagline: "Learning, exams, and the path ahead."');
    expect(intake).toContain('tagline: "Body, mind, and habits."');
  });
});
