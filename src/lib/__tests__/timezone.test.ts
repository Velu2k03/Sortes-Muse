// Phase 4B (4.3): IANA timezone lookup + historical UTC offset
// (including DST) for birth times, via tz-lookup (already in the
// dependency tree, via circular-natal-horoscope-js) and the Intl API.
// No new dependency. Every offset below is a known civil fact:
// New York is UTC-5 in standard time and UTC-4 in daylight time;
// London is UTC+0 / UTC+1 (BST); Kathmandu is UTC+5:45; Madrid in
// July is UTC+2 while its longitude alone would say UTC-0:15.
import { describe, it, expect } from "vitest";
import {
  lookupTimeZone,
  isValidTimeZone,
  utcOffsetMinutesAt,
  localWallTimeToUtc,
  resolveBirthTime,
  solarWallTime,
  formatUtcOffset,
} from "@/lib/timezone";

describe("lookupTimeZone", () => {
  it("resolves well-known cities to their IANA zone", () => {
    expect(lookupTimeZone(40.7128, -74.006)).toBe("America/New_York");
    expect(lookupTimeZone(14.5995, 120.9842)).toBe("Asia/Manila");
    expect(lookupTimeZone(51.5074, -0.1278)).toBe("Europe/London");
    expect(lookupTimeZone(-33.8688, 151.2093)).toBe("Australia/Sydney");
    expect(lookupTimeZone(27.7172, 85.324)).toBe("Asia/Kathmandu");
  });
  it("returns null for out-of-range coordinates instead of throwing", () => {
    expect(lookupTimeZone(100, 0)).toBeNull();
    expect(lookupTimeZone(0, 200)).toBeNull();
    expect(lookupTimeZone(Number.NaN, 0)).toBeNull();
  });
  it("still resolves ocean points (tz-lookup covers them with Etc zones)", () => {
    expect(lookupTimeZone(0, -150)).toBe("Pacific/Kiritimati");
    expect(lookupTimeZone(0, 0)).toBe("Etc/GMT");
  });
});

describe("isValidTimeZone", () => {
  it("accepts real IANA names and rejects the rest", () => {
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("Asia/Manila")).toBe(true);
    expect(isValidTimeZone("Etc/GMT")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("GMT+8")).toBe(false);
  });
});

describe("utcOffsetMinutesAt", () => {
  it("gives DST vs standard offsets for the same zone", () => {
    // 1990-07-01 16:00 UTC is EDT in New York; 1990-01-01 17:00 UTC is EST.
    expect(utcOffsetMinutesAt("America/New_York", Date.UTC(1990, 6, 1, 16))).toBe(-240);
    expect(utcOffsetMinutesAt("America/New_York", Date.UTC(1990, 0, 1, 17))).toBe(-300);
    // London: BST in July, GMT in January.
    expect(utcOffsetMinutesAt("Europe/London", Date.UTC(1990, 6, 1, 11))).toBe(60);
    expect(utcOffsetMinutesAt("Europe/London", Date.UTC(1990, 0, 1, 12))).toBe(0);
    // Kathmandu is a 45-minute zone, year round.
    expect(utcOffsetMinutesAt("Asia/Kathmandu", Date.UTC(1990, 0, 1, 2, 15))).toBe(345);
    // Sydney is in DST in January (UTC+11) and standard in July (UTC+10).
    expect(utcOffsetMinutesAt("Australia/Sydney", Date.UTC(1990, 0, 1, 1))).toBe(660);
    expect(utcOffsetMinutesAt("Australia/Sydney", Date.UTC(1990, 6, 1, 2))).toBe(600);
  });
});

describe("localWallTimeToUtc", () => {
  it("converts a DST wall time with the daylight offset", () => {
    const r = localWallTimeToUtc("1990-07-01", 12, 0, "America/New_York");
    expect(new Date(r.utcMs).toISOString()).toBe("1990-07-01T16:00:00.000Z");
    expect(r.utcOffsetMinutes).toBe(-240);
  });
  it("converts a standard-time wall time with the standard offset", () => {
    const r = localWallTimeToUtc("1990-01-01", 12, 0, "America/New_York");
    expect(new Date(r.utcMs).toISOString()).toBe("1990-01-01T17:00:00.000Z");
    expect(r.utcOffsetMinutes).toBe(-300);
  });
  it("pins a zone where civil time differs far from longitude time", () => {
    // Madrid longitude -3.7 would say UTC-0:15; civil time in July
    // 1990 is UTC+2, a 135-minute difference from longitude-only.
    const r = localWallTimeToUtc("1990-07-01", 12, 0, "Europe/Madrid");
    expect(new Date(r.utcMs).toISOString()).toBe("1990-07-01T10:00:00.000Z");
    expect(r.utcOffsetMinutes).toBe(120);
  });
  it("resolves a spring-forward gap time to the first valid time after the gap", () => {
    // 02:30 never happens on 2026-03-08 in New York (clocks jump
    // 02:00 to 03:00). Documented convention: the first valid wall
    // time after the gap, 03:30 EDT = 07:30 UTC.
    const r = localWallTimeToUtc("2026-03-08", 2, 30, "America/New_York");
    expect(new Date(r.utcMs).toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(r.utcOffsetMinutes).toBe(-240);
  });
  it("resolves a fall-back ambiguous time to its first occurrence", () => {
    // 01:30 happens twice on 2026-11-01 in New York. Documented
    // convention: the first occurrence, 01:30 EDT = 05:30 UTC.
    const r = localWallTimeToUtc("2026-11-01", 1, 30, "America/New_York");
    expect(new Date(r.utcMs).toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(r.utcOffsetMinutes).toBe(-240);
  });
  it("throws on an invalid zone instead of guessing", () => {
    expect(() => localWallTimeToUtc("1990-01-01", 12, 0, "Not/AZone")).toThrow(/Unknown timezone/);
  });
});

describe("resolveBirthTime", () => {
  it("uses the IANA zone from coordinates with the historical offset", () => {
    const r = resolveBirthTime({ date: "1990-07-01", hour: 12, minute: 0, latitude: 40.7128, longitude: -74.006 });
    expect(r.basis).toBe("iana");
    expect(r.timeZone).toBe("America/New_York");
    expect(r.utcOffsetMinutes).toBe(-240);
    expect(r.utc.toISOString()).toBe("1990-07-01T16:00:00.000Z");
  });
  it("lets an explicit zone override the coordinate lookup", () => {
    const r = resolveBirthTime({ date: "1990-07-01", hour: 12, minute: 0, latitude: 40.7128, longitude: -74.006, timeZone: "Europe/London" });
    expect(r.basis).toBe("iana");
    expect(r.timeZone).toBe("Europe/London");
    expect(r.utc.toISOString()).toBe("1990-07-01T11:00:00.000Z");
  });
  it("throws on an invalid explicit zone instead of silently shifting", () => {
    expect(() =>
      resolveBirthTime({ date: "1990-07-01", hour: 12, minute: 0, latitude: 40.7128, longitude: -74.006, timeZone: "Not/AZone" })
    ).toThrow(/Unknown timezone/);
  });
  it("falls back to longitude only when no zone can be resolved", () => {
    const r = resolveBirthTime({ date: "1990-01-01", hour: 8, minute: 0, longitude: 120.9842 });
    expect(r.basis).toBe("longitude");
    expect(r.timeZone).toBeNull();
    // Longitude-only: 120.9842 / 15 hours = 8h 03m 56.208s, so 08:00
    // civil becomes 23:56:03.792 UTC on the previous day.
    expect(r.utc.toISOString()).toBe("1989-12-31T23:56:03.792Z");
    expect(r.utcOffsetMinutes).toBeCloseTo(483.94, 1);
  });
});

describe("solarWallTime", () => {
  it("converts UTC to local solar time by longitude", () => {
    // Manila 1990-01-01 08:00 civil is 00:00 UTC; solar time adds
    // 120.9842 / 15 hours = 8h 03.94m, giving 08:04 solar, a +3.9
    // minute correction against civil time (same as the old
    // longitude-only correction for Manila, by design).
    const civilMs = Date.UTC(1990, 0, 1, 8, 0);
    const r = solarWallTime(new Date(Date.UTC(1990, 0, 1, 0, 0)), 120.9842, civilMs);
    expect(r.date).toBe("1990-01-01");
    expect(r.hour).toBe(8);
    expect(r.minute).toBe(4);
    expect(r.correctionMinutes).toBe(3.9);
  });
  it("shows the big DST correction for a summer New York birth", () => {
    // 1990-07-01 07:30 civil in New York is 11:30 UTC (EDT). Solar
    // time is UTC - 74.006/15h = 06:34, a -56 minute correction
    // against civil time: longitude-only said +4 minutes.
    const civilMs = Date.UTC(1990, 6, 1, 7, 30);
    const r = solarWallTime(new Date(Date.UTC(1990, 6, 1, 11, 30)), -74.006, civilMs);
    expect(r.date).toBe("1990-07-01");
    expect(r.hour).toBe(6);
    expect(r.minute).toBe(34);
    expect(r.correctionMinutes).toBe(-56);
  });
});

describe("formatUtcOffset", () => {
  it("formats offsets as UTC±HH:MM", () => {
    expect(formatUtcOffset(-240)).toBe("UTC−04:00");
    expect(formatUtcOffset(345)).toBe("UTC+05:45");
    expect(formatUtcOffset(0)).toBe("UTC+00:00");
    expect(formatUtcOffset(60)).toBe("UTC+01:00");
  });
});
