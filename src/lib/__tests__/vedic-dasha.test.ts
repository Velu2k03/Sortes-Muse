import { describe, expect, it } from "vitest";
import { ayanamsa, julianDay } from "caelus";
import { calculateVedic, computeDashaTimeline } from "@/lib/vedic";

// Phase E (item 4): the ayanamsa and the pratyantar are now published
// with their values, so they are pinned here instead of trusted.

describe("ayanamsa", () => {
  it("reads the Lahiri value from caelus itself, matching Swiss Ephemeris to 1e-9 deg", () => {
    // 1990-01-01 00:00 UT, the golden chart's birth moment in UT.
    const jd = julianDay(1990, 1, 1, 0, 0, 0);
    expect(ayanamsa(jd, "lahiri")).toBeCloseTo(23.71740660573711, 9);
  });

  it("publishes the birth-date ayanamsa on the Vedic result", () => {
    const result = calculateVedic({
      date: "1990-01-01",
      hour: 8,
      minute: 0,
      latitude: 14.6,
      longitude: 121.05,
    });
    // 08:00 Manila is 00:00 UT on the same date.
    expect(result.ayanamsaDegrees).toBeCloseTo(23.71740660573711, 6);
    expect(result.sunSign).toBe("Sagittarius");
  });
});

describe("computeDashaTimeline — dated pratyantar", () => {
  it("dates the pratyantar inside the current antardasha with the 120-year subdivision", () => {
    // Golden chart Moon, sidereal Aquarius 302.80.
    const timeline = computeDashaTimeline(302.8, "1990-01-01", "2026-11-07");
    const { currentMahadasha, currentAntardasha, currentPratyantar } = timeline;
    expect(currentMahadasha).not.toBeNull();
    expect(currentAntardasha).not.toBeNull();
    expect(currentPratyantar).not.toBeNull();
    // The pratyantar sits inside the antardasha, which sits inside
    // the mahadasha, and the as-of date sits inside all three.
    expect(currentPratyantar!.start >= currentAntardasha!.start).toBe(true);
    expect(currentPratyantar!.end <= currentAntardasha!.end).toBe(true);
    expect(currentAntardasha!.start >= currentMahadasha!.start).toBe(true);
    expect(currentAntardasha!.end <= currentMahadasha!.end).toBe(true);
    expect("2026-11-07" >= currentPratyantar!.start).toBe(true);
    expect("2026-11-07" < currentPratyantar!.end).toBe(true);
    // Duration check: pratyantar years = (antardasha years x lord
    // years) / 120, in 365.25-day years.
    const years: Record<string, number> = {
      Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7,
      Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17,
    };
    const parse = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
    const antarYears = (parse(currentAntardasha!.end) - parse(currentAntardasha!.start)) / (365.25 * 86400000);
    const expectedMs = (antarYears * years[currentPratyantar!.lord]!) / 120 * 365.25 * 86400000;
    const actualMs = parse(currentPratyantar!.end) - parse(currentPratyantar!.start);
    expect(Math.abs(actualMs - expectedMs)).toBeLessThan(86400000);
  });

  it("exposes the dated pratyantar on the Vedic result, matching the caelus name", () => {
    const result = calculateVedic({
      date: "1990-01-01",
      hour: 8,
      minute: 0,
      latitude: 14.6,
      longitude: 121.05,
    });
    expect(result.currentPratyantar).not.toBeNull();
    // currentDasha ends with the pratyantar name from caelus; the
    // dated pratyantar from the local timeline must agree with it.
    const parts = result.currentDasha.split(" / ");
    expect(result.currentPratyantar!.lord).toBe(parts[parts.length - 1]);
  });
});
