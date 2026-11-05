// Phase 4B (4.3): timezone wiring into the three calculators.
// Vedic and Ziwei previously used longitude only; Western already
// used a timezone database inside its engine, so its test pins the
// new metadata fields and that the math did not move.
import { describe, it, expect } from "vitest";
import { calculateZiwei, calculateWestern } from "@/lib/charts";
import { calculateVedic } from "@/lib/vedic";
import { formatTimeLabelEn } from "@/lib/ziwei-i18n";

describe("Vedic timezone handling", () => {
  it("resolves the IANA zone from coordinates and reports it", () => {
    const r = calculateVedic({ date: "1990-07-01", hour: 12, latitude: 40.7128, longitude: -74.006 });
    expect(r.timeBasis).toBe("iana");
    expect(r.timeZone).toBe("America/New_York");
    expect(r.utcOffsetMinutes).toBe(-240);
  });
  it("moves the chart by the DST offset, not the longitude offset", () => {
    // Same wall time, same coordinates, two zones one hour apart:
    // the Moon moves about 0.55 degrees in that hour, the Sun about
    // 0.04 degrees. A longitude-only conversion would give identical
    // positions for both, because longitude is the same.
    const ny = calculateVedic({ date: "1990-07-01", hour: 12, latitude: 40.7128, longitude: -74.006, timeZone: "America/New_York" });
    const chi = calculateVedic({ date: "1990-07-01", hour: 12, latitude: 40.7128, longitude: -74.006, timeZone: "America/Chicago" });
    const moonNy = ny.planets.find((p) => p.name === "moon")!.longitude;
    const moonChi = chi.planets.find((p) => p.name === "moon")!.longitude;
    const sunNy = ny.planets.find((p) => p.name === "sun")!.longitude;
    const sunChi = chi.planets.find((p) => p.name === "sun")!.longitude;
    expect(Math.abs(moonNy - moonChi)).toBeGreaterThan(0.3);
    expect(Math.abs(moonNy - moonChi)).toBeLessThan(0.8);
    expect(Math.abs(sunNy - sunChi)).toBeGreaterThan(0.02);
    expect(Math.abs(sunNy - sunChi)).toBeLessThan(0.08);
  });
  it("auto-lookup matches an explicit zone override", () => {
    const auto = calculateVedic({ date: "1990-07-01", hour: 12, latitude: 40.7128, longitude: -74.006 });
    const explicit = calculateVedic({ date: "1990-07-01", hour: 12, latitude: 40.7128, longitude: -74.006, timeZone: "America/New_York" });
    expect(auto.planets.find((p) => p.name === "moon")!.longitude).toBe(
      explicit.planets.find((p) => p.name === "moon")!.longitude
    );
  });
  it("keeps the golden Manila case (offset +480 vs longitude +483.94)", () => {
    const r = calculateVedic({ date: "1990-01-01", hour: 8, latitude: 14.5995, longitude: 120.9842 });
    expect(r.timeBasis).toBe("iana");
    expect(r.timeZone).toBe("Asia/Manila");
    expect(r.utcOffsetMinutes).toBe(480);
    expect(r.sunSign).toBe("Sagittarius");
    expect(r.moonSign).toBe("Aquarius");
    expect(r.moonNakshatra).toBe("Dhanishta");
    expect(r.moonNakshatraPada).toBe(3);
  });
});

describe("Ziwei timezone handling", () => {
  it("keeps the Manila correction and reports the zone", () => {
    const r = calculateZiwei({ date: "1990-01-01", hour: 8, gender: "female", latitude: 14.5995, longitude: 120.9842 });
    expect(r.timeBasis).toBe("iana");
    expect(r.timeZone).toBe("Asia/Manila");
    expect(r.utcOffsetMinutes).toBe(480);
    expect(r.solarCorrectionMinutes).toBe(3.9);
    expect(r.palaces.find((p) => p.isLifePalace)?.majorStars).toEqual(["太阳", "天梁"]);
  });
  it("a summer New York birth lands in the DST-correct double-hour", () => {
    // 07:30 civil in New York, July 1990: solar time is 06:34
    // (EDT, -56 min correction), so Mao hour (05:00-07:00).
    // Longitude-only said +4 minutes, 07:34, Chen hour.
    const r = calculateZiwei({ date: "1990-07-01", hour: 7, minute: 30, gender: "female", latitude: 40.7128, longitude: -74.006 });
    expect(r.timeBasis).toBe("iana");
    expect(r.timeZone).toBe("America/New_York");
    expect(r.solarCorrectionMinutes).toBe(-56);
    expect(formatTimeLabelEn(r.timeLabel)).toBe("Mao hour (05:00-07:00)");
  });
  it("without a latitude it keeps the old longitude-only path", () => {
    const r = calculateZiwei({ date: "1990-07-01", hour: 7, minute: 30, gender: "female", longitude: -74.006 });
    expect(r.timeBasis).toBe("longitude");
    expect(r.timeZone).toBeNull();
    expect(r.solarCorrectionMinutes).toBe(4);
    expect(formatTimeLabelEn(r.timeLabel)).toBe("Chen hour (07:00-09:00)");
  });
});

describe("Western timezone metadata", () => {
  it("reports the zone the engine already used, without moving the math", () => {
    const r = calculateWestern({ date: "1990-01-01", hour: 8, latitude: 14.5995, longitude: 120.9842 });
    expect(r.timeBasis).toBe("iana");
    expect(r.timeZone).toBe("Asia/Manila");
    expect(r.utcOffsetMinutes).toBe(480);
    expect(r.sunSign).toBe("Capricorn");
    expect(r.ascendantLongitude).toBeCloseTo(303.82, 1);
  });
  it("reports DST for a summer New York birth", () => {
    const r = calculateWestern({ date: "1990-07-01", hour: 12, latitude: 40.7128, longitude: -74.006 });
    expect(r.timeZone).toBe("America/New_York");
    expect(r.utcOffsetMinutes).toBe(-240);
  });
});
