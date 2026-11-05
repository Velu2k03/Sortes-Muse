import { describe, it, expect } from "vitest";
import { buildStaticChartInterpretation } from "@/lib/chart-fallback";
import type { WesternResult, ZiweiResult } from "@/lib/charts";
import type { VedicResult } from "@/lib/vedic";

const western: WesternResult = {
  system: "western",
  sunSign: "Aries",
  ascendantSign: "Leo",
  ascendantLongitude: 130,
  midheavenSign: "Taurus",
  midheavenLongitude: 45,
  unknownTime: false,
  timeZone: "Asia/Manila",
  utcOffsetMinutes: 480,
  timeBasis: "iana",
  planets: [
    { name: "Sun", longitude: 10, sign: "Aries", house: 1, retrograde: false },
    { name: "Moon", longitude: 100, sign: "Cancer", house: 4, retrograde: false },
    { name: "Mercury", longitude: 25, sign: "Taurus", house: 2, retrograde: true },
  ],
  cusps: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330],
  aspectCount: 1,
  aspects: [{ planet1: "Sun", planet2: "Moon", label: "square", orb: 2.5 }],
};

const westernUnknownTime: WesternResult = {
  ...western,
  ascendantSign: null,
  ascendantLongitude: null,
  midheavenSign: null,
  midheavenLongitude: null,
  unknownTime: true,
  cusps: [],
  planets: western.planets.map((p) => ({ ...p, house: null })),
};

const vedic = {
  system: "vedic",
  sunSign: "Taurus",
  moonSign: "Cancer",
  ascendantSign: "Virgo",
  ascendantLongitude: 150,
  timeZone: "Asia/Manila",
  utcOffsetMinutes: 480,
  timeBasis: "iana",
  divisional: {},
  moonNakshatra: "Pushya",
  moonNakshatraPada: 2,
  moonNakshatraLord: "Saturn",
  currentDasha: "Saturn",
  dashaAsOf: "2026-11-05",
  dashaTimeline: [],
  currentAntardasha: { lord: "Mercury", start: "2026-01-01", end: "2026-06-01" },
  unknownTime: false,
  planets: [
    { name: "Sun", longitude: 40, sign: "Taurus", house: 9, retrograde: false },
    { name: "Moon", longitude: 100, sign: "Cancer", house: 11, retrograde: false },
  ],
  cusps: [],
} as unknown as VedicResult;

const ziwei: ZiweiResult = {
  system: "ziwei",
  solarDate: "1990-05-01",
  lunarDate: "1990-04-07",
  chineseDate: "庚午年四月初七",
  zodiac: "马",
  sign: "Taurus",
  timeLabel: "午时",
  unknownTime: false,
  solarCorrectionMinutes: 0,
  solarCorrectedTime: null,
  timeZone: "Asia/Manila",
  utcOffsetMinutes: 480,
  timeBasis: "iana",
  palaces: [
    {
      index: 0,
      name: "Life",
      chineseName: "命宫",
      heavenlyStem: "庚",
      earthlyBranch: "午",
      majorStars: ["紫微"],
      majorStarsDetail: [{ name: "紫微", brightness: "庙", mutagen: "" }],
      minorStars: [],
      isLifePalace: true,
    },
    {
      index: 1,
      name: "Parents",
      chineseName: "父母宫",
      heavenlyStem: "辛",
      earthlyBranch: "未",
      majorStars: ["天机"],
      majorStarsDetail: [{ name: "天机", brightness: "旺", mutagen: "禄" }],
      minorStars: [],
      isLifePalace: false,
    },
  ],
};

describe("buildStaticChartInterpretation", () => {
  it("labels itself standard, not AI-generated, and names the computed placements", () => {
    const text = buildStaticChartInterpretation(western, "general");
    expect(text).toContain("Standard interpretation");
    expect(text).toContain("not written by AI");
    expect(text).toContain("Sun is in Aries");
    expect(text).toContain("Moon is in Cancer");
    expect(text).toContain("Mercury in Taurus");
    expect(text).toContain("Sun square Moon");
    expect(text).toContain("Rising sign is Leo");
    expect(text).toContain("nothing was spent");
    expect(text).toContain("not guaranteed predictions");
  });

  it("withholds Rising, Midheaven, and houses when birth time is unknown", () => {
    const text = buildStaticChartInterpretation(westernUnknownTime, "career");
    expect(text).not.toContain("Rising");
    expect(text).not.toContain("Midheaven");
    expect(text).not.toContain("house");
    expect(text).toContain("Sun is in Aries");
  });

  it("covers Vedic placements and the current dasha", () => {
    const text = buildStaticChartInterpretation(vedic, "love");
    expect(text).toContain("Pushya");
    expect(text).toContain("Saturn");
    expect(text).toContain("Mercury antardasha");
    expect(text).toContain("Lagna");
  });

  it("covers Ziwei Life palace stars", () => {
    const text = buildStaticChartInterpretation(ziwei, "general");
    expect(text).toContain("Life palace holds");
    expect(text).toContain("Parents holds");
    // localizeStar's real English names, not guesses: 紫微 is
    // "Emperor", 天机 is "Strategist".
    expect(text).toContain("Emperor");
    expect(text).toContain("Strategist");
  });

  it("is deterministic: the same chart always yields the same text", () => {
    expect(buildStaticChartInterpretation(western, "general")).toBe(
      buildStaticChartInterpretation(western, "general")
    );
  });

  it("adds the health closing for a health focus", () => {
    const text = buildStaticChartInterpretation(western, "health");
    expect(text).toContain("not medical advice");
  });
});
