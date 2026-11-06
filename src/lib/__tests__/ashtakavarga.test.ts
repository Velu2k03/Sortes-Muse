import { describe, expect, it } from "vitest";
import { calculateVedic } from "@/lib/vedic";
import {
  computeAshtakavarga,
  ASHTAKAVARGA_GRAND_TOTAL,
  type AshtakavargaPlanet,
} from "@/lib/ashtakavarga";

// Phase E (item 5): Ashtakavarga is verified against the published
// sample grid, not trusted from memory. The sample chart is
// 14 Aug 1994, 06:42, Ahmedabad, Leo rising, as published by Astro
// Clock AI: Sun and Mercury in Cancer, Venus in Virgo, Moon and
// Jupiter in Libra, Saturn in Aquarius, Mars in Gemini. The grid
// below is the published 84-cell result; the test asserts every
// cell, the fixed per-planet totals, and the 337 grand total.

const SAMPLE_SIGNS: Record<AshtakavargaPlanet | "lagna", number> = {
  sun: 3, // Cancer
  moon: 6, // Libra
  mars: 2, // Gemini
  mercury: 3, // Cancer
  jupiter: 6, // Libra
  venus: 5, // Virgo
  saturn: 10, // Aquarius
  lagna: 4, // Leo
};

const PUBLISHED_GRID: Record<AshtakavargaPlanet, number[]> = {
  sun: [5, 3, 3, 3, 4, 3, 5, 7, 3, 4, 4, 4],
  moon: [3, 2, 5, 4, 4, 5, 2, 3, 6, 5, 4, 6],
  mars: [5, 5, 2, 3, 5, 2, 2, 3, 3, 4, 2, 3],
  mercury: [4, 6, 2, 6, 5, 4, 2, 7, 3, 7, 4, 4],
  jupiter: [5, 3, 4, 4, 4, 6, 4, 3, 7, 5, 5, 6],
  venus: [4, 6, 4, 6, 5, 2, 4, 2, 4, 7, 6, 2],
  saturn: [6, 1, 3, 2, 3, 2, 4, 4, 4, 4, 3, 3],
};
const PUBLISHED_SAV = [32, 26, 23, 28, 30, 24, 23, 29, 30, 36, 28, 28];
const PUBLISHED_TOTALS: Record<AshtakavargaPlanet, number> = {
  sun: 48, moon: 49, mars: 39, mercury: 54, jupiter: 56, venus: 52, saturn: 39,
};

function samplePlanets() {
  return (Object.keys(SAMPLE_SIGNS) as Array<keyof typeof SAMPLE_SIGNS>)
    .filter((k) => k !== "lagna")
    .map((name) => ({ name, longitude: SAMPLE_SIGNS[name] * 30 + 10 }));
}

describe("computeAshtakavarga — published sample grid", () => {
  it("reproduces all 84 published BAV cells for the sample chart", () => {
    const result = computeAshtakavarga(samplePlanets(), SAMPLE_SIGNS.lagna * 30 + 10);
    expect(result).not.toBeNull();
    for (const planet of Object.keys(PUBLISHED_GRID) as AshtakavargaPlanet[]) {
      expect(result!.bav[planet]).toEqual(PUBLISHED_GRID[planet]);
    }
  });

  it("matches the published Sarvashtakavarga and the 337 checksum", () => {
    const result = computeAshtakavarga(samplePlanets(), SAMPLE_SIGNS.lagna * 30 + 10);
    expect(result!.sav).toEqual(PUBLISHED_SAV);
    expect(result!.total).toBe(ASHTAKAVARGA_GRAND_TOTAL);
    for (const planet of Object.keys(PUBLISHED_TOTALS) as AshtakavargaPlanet[]) {
      expect(result!.bav[planet].reduce((a, b) => a + b, 0)).toBe(PUBLISHED_TOTALS[planet]);
    }
  });

  it("reads each planet's own bindus in the sign it occupies", () => {
    const result = computeAshtakavarga(samplePlanets(), SAMPLE_SIGNS.lagna * 30 + 10);
    // Sun in Cancer (12th house) 4, Moon in Libra (3rd) 5, Mars in
    // Gemini (11th) 2, Mercury in Cancer (12th) 4, Jupiter in Libra
    // (3rd) 4, Venus in Virgo (2nd) 6, Saturn in Aquarius (7th) 4.
    expect(result!.natalBindus).toEqual({
      sun: 4, moon: 5, mars: 2, mercury: 4, jupiter: 4, venus: 6, saturn: 4,
    });
  });

  it("returns null without a birth time, because houses need the Lagna", () => {
    expect(computeAshtakavarga(samplePlanets(), null)).toBeNull();
  });
});

describe("calculateVedic — golden chart Ashtakavarga", () => {
  it("computes a complete grid that sums to 337", () => {
    const result = calculateVedic({ date: "1990-01-01", hour: 8, latitude: 14.5995, longitude: 120.9842 });
    expect(result.ashtakavarga).not.toBeNull();
    expect(result.ashtakavarga!.total).toBe(337);
    expect(result.ashtakavarga!.sav).toHaveLength(12);
    for (const planet of Object.keys(PUBLISHED_TOTALS) as AshtakavargaPlanet[]) {
      expect(result.ashtakavarga!.bav[planet].reduce((a, b) => a + b, 0)).toBe(PUBLISHED_TOTALS[planet]);
    }
  });
});
