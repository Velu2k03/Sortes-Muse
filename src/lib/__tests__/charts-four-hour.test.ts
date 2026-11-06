import { describe, it, expect } from "vitest";
import { calculateWestern, calculateZiwei } from "@/lib/charts";
import { calculateVedic } from "@/lib/vedic";

// Phase G: the four-hour test. A chart must actually respond to the
// birth moment and the birthplace. Changing the birth time by four
// hours, or moving the birthplace across the world at the same wall
// time, must change the relevant chart outputs. A calculator that
// returned the same angles, houses, or sign placements for any input
// would be a decoration, not a chart.

const NY = { latitude: 40.7128, longitude: -74.006 };
const MANILA = { latitude: 14.5995, longitude: 120.9842 };

describe("four-hour test: birth time changes the chart", () => {
  it("Western: four hours apart moves the Ascendant and the houses", () => {
    const early = calculateWestern({ date: "1990-07-01", hour: 7, minute: 30, ...NY });
    const late = calculateWestern({ date: "1990-07-01", hour: 11, minute: 30, ...NY });
    expect(early.ascendantLongitude).not.toBeNull();
    expect(late.ascendantLongitude).not.toBeNull();
    // The Ascendant moves about 15 degrees per hour, so four hours
    // is about 60 degrees. 10 degrees is a deliberately loose floor.
    expect(Math.abs(early.ascendantLongitude! - late.ascendantLongitude!)).toBeGreaterThan(10);
    expect(early.ascendantSign).not.toBe(late.ascendantSign);
    expect(early.cusps.length).toBe(12);
    expect(late.cusps.length).toBe(12);
    expect(Math.abs(early.cusps[0] - late.cusps[0])).toBeGreaterThan(10);
    // The Moon moves about 0.55 degrees per hour, so four hours is
    // about 2.2 degrees. The Sun barely moves in four hours.
    const moonEarly = early.planets.find((p) => p.name === "Moon")!.longitude;
    const moonLate = late.planets.find((p) => p.name === "Moon")!.longitude;
    expect(Math.abs(moonEarly - moonLate)).toBeGreaterThan(1);
  });

  it("Western: the same wall time in another city moves the Moon and the zone", () => {
    const ny = calculateWestern({ date: "1990-07-01", hour: 7, minute: 30, ...NY });
    const manila = calculateWestern({ date: "1990-07-01", hour: 7, minute: 30, ...MANILA });
    expect(ny.timeZone).toBe("America/New_York");
    expect(manila.timeZone).toBe("Asia/Manila");
    expect(ny.utcOffsetMinutes).not.toBe(manila.utcOffsetMinutes);
    // The Moon moves about 13 degrees a day, so the ~12-hour UT gap
    // between the two wall times moves it about 6 degrees.
    const moonNy = ny.planets.find((p) => p.name === "Moon")!.longitude;
    const moonManila = manila.planets.find((p) => p.name === "Moon")!.longitude;
    expect(Math.abs(moonNy - moonManila)).toBeGreaterThan(1);
    // The Ascendant differs too, but only slightly for this pair:
    // the 195-degree longitude gap nearly cancels the ~12-hour UT
    // gap, so the rising signs agree (both Leo) and the longitudes
    // sit about 2 degrees apart. Asserting a large ASC move here
    // would be asserting bad astronomy, not testing the code.
    expect(ny.ascendantLongitude).not.toBe(manila.ascendantLongitude);
  });

  it("Vedic: four hours apart moves the Lagna", () => {
    const early = calculateVedic({ date: "1990-07-01", hour: 7, minute: 30, ...NY });
    const late = calculateVedic({ date: "1990-07-01", hour: 11, minute: 30, ...NY });
    expect(early.ascendantLongitude).not.toBeNull();
    expect(late.ascendantLongitude).not.toBeNull();
    expect(Math.abs(early.ascendantLongitude! - late.ascendantLongitude!)).toBeGreaterThan(10);
    expect(early.ascendantSign).not.toBe(late.ascendantSign);
    const moonEarly = early.planets.find((p) => p.name === "moon")!.longitude;
    const moonLate = late.planets.find((p) => p.name === "moon")!.longitude;
    expect(Math.abs(moonEarly - moonLate)).toBeGreaterThan(1);
  });

  it("Vedic: the same wall time in another city moves the Moon", () => {
    const ny = calculateVedic({ date: "1990-07-01", hour: 7, minute: 30, ...NY });
    const manila = calculateVedic({ date: "1990-07-01", hour: 7, minute: 30, ...MANILA });
    expect(ny.timeZone).toBe("America/New_York");
    expect(manila.timeZone).toBe("Asia/Manila");
    const moonNy = ny.planets.find((p) => p.name === "moon")!.longitude;
    const moonManila = manila.planets.find((p) => p.name === "moon")!.longitude;
    // About 12 hours of UT apart: the Moon moves about 6 degrees.
    expect(Math.abs(moonNy - moonManila)).toBeGreaterThan(1);
  });

  it("Ziwei: four hours apart changes the double-hour and the palaces", () => {
    const early = calculateZiwei({ date: "1990-07-01", hour: 6, minute: 30, gender: "female", ...NY });
    const late = calculateZiwei({ date: "1990-07-01", hour: 10, minute: 30, gender: "female", ...NY });
    expect(early.timeLabel).not.toBe(late.timeLabel);
    expect(JSON.stringify(early.palaces)).not.toBe(JSON.stringify(late.palaces));
  });

  it("Ziwei: the same wall time in another city resolves a different zone", () => {
    const ny = calculateZiwei({ date: "1990-07-01", hour: 7, minute: 30, gender: "female", ...NY });
    const manila = calculateZiwei({ date: "1990-07-01", hour: 7, minute: 30, gender: "female", ...MANILA });
    // Phase 4B golden case: New York 07:30 civil corrects to 06:34
    // solar, which flips the double-hour from Chen to Mao.
    expect(ny.solarCorrectedTime).toBe("06:34");
    expect(ny.timeZone).toBe("America/New_York");
    expect(manila.timeZone).toBe("Asia/Manila");
    expect(manila.utcOffsetMinutes).not.toBe(ny.utcOffsetMinutes);
    // The two solar times agree here (both 06:34), and that is
    // correct, not a bug: Manila was on DST (UTC+9) until July 28,
    // 1990, so the 13-hour UT gap is exactly cancelled by the
    // 13-hour longitude gap. Same wall time in two far-apart cities
    // nearly always lands near the same solar time, because civil
    // zones follow longitude. So the longitude leg is isolated below
    // with one shared zone override instead.
  });

  it("Ziwei: longitude alone moves the solar time when the zone is held fixed", () => {
    const base = { date: "1990-07-01", hour: 7, minute: 30, gender: "female" as const, latitude: 40.7128, timeZone: "America/New_York" };
    const east = calculateZiwei({ ...base, longitude: -74.006 });
    const west = calculateZiwei({ ...base, longitude: -122.4194 });
    // Same wall time, same zone, so the same UT. The 48-degree
    // longitude gap is about 3.2 solar hours, so the corrected times
    // and the double-hours must differ.
    expect(east.solarCorrectedTime).toBe("06:34");
    expect(west.solarCorrectedTime).not.toBe(east.solarCorrectedTime);
    expect(west.timeLabel).not.toBe(east.timeLabel);
  });

  it("control: identical inputs give identical charts", () => {
    const a = calculateWestern({ date: "1990-07-01", hour: 7, minute: 30, ...NY });
    const b = calculateWestern({ date: "1990-07-01", hour: 7, minute: 30, ...NY });
    expect(a).toEqual(b);
  });
});
