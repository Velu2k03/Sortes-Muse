import { describe, it, expect } from "vitest";
import { SPREADS } from "@/lib/tarot";
import { SPREAD_SAMPLES } from "@/lib/spread-samples";

// Phase 3 (3.7): every spread has its own sample, and no two
// spreads share one. The old template rendered the same Star / Sun /
// Magician meanings for every spread; this pins the replacement.
describe("SPREAD_SAMPLES", () => {
  it("covers every spread exactly once", () => {
    const slugs = SPREADS.map((s) => s.slug).sort();
    expect(Object.keys(SPREAD_SAMPLES).sort()).toEqual(slugs);
    for (const slug of slugs) {
      expect(SPREAD_SAMPLES[slug as keyof typeof SPREAD_SAMPLES].trim().length).toBeGreaterThan(0);
    }
  });

  it("gives each spread a distinct, short sample", () => {
    const samples = Object.values(SPREAD_SAMPLES);
    expect(new Set(samples).size).toBe(samples.length);
    for (const sample of samples) {
      expect(sample.length).toBeGreaterThan(80);
      expect(sample.length).toBeLessThan(700);
    }
  });

  it("does not reuse the old shared Star / Sun / Magician template", () => {
    for (const sample of Object.values(SPREAD_SAMPLES)) {
      expect(sample).not.toMatch(/The Star|The Sun|The Magician/);
    }
  });
});
