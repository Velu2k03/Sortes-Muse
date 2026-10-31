// Chart calculation only. No AI, no credits, no storage, no database.
// Birth data passed in here is used in-memory for this calculation only:
// callers must not persist it and must not send it to any AI prompt.
// See /charts page and /api/chart/calculate for the privacy note shown to users.
// Server-only: iztro and circular-natal-horoscope-js are CJS-only bundles,
// so they are loaded with createRequire (works in the Node route and in
// the Node test script; this file must not be imported by client components).
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const astro = (require("iztro") as { astro: unknown }).astro as {
  bySolar: (solar: string, timeIndex: number, gender: string) => {
    lunarDate: string;
    chineseDate: string;
    zodiac: string;
    sign: string;
    time: string;
    earthlyBranchOfSoulPalace: string;
    palaces: unknown[];
  };
};
const circular = require("circular-natal-horoscope-js") as {
  Origin: new (opts: Record<string, unknown>) => unknown;
  Horoscope: new (opts: Record<string, unknown>) => unknown;
};
const { Origin, Horoscope } = circular;

export type ChartSystem = "ziwei" | "western";
export type ChartGender = "male" | "female";

export interface ChartInput {
  system: ChartSystem;
  date: string; // YYYY-MM-DD, real calendar date
  hour: number | null; // 0-23 local clock hour, null = unknown
  minute?: number;
  gender: ChartGender;
  latitude: number;
  longitude: number;
}

// shortcut: iztro's own en-US star names are misleading translations
// (e.g. "rebel"), so Phase 1 keeps Chinese star names and maps only the
// 12 palace names to English. Full star translation is a later upgrade.
const PALACE_EN: Record<string, string> = {
  "命宫": "Life",
  "兄弟": "Siblings",
  "夫妻": "Partner",
  "子女": "Children",
  "财帛": "Wealth",
  "疾厄": "Health",
  "迁移": "Travel",
  "仆役": "Friends",
  "官禄": "Career",
  "田宅": "Home",
  "福德": "Fortune",
  "父母": "Parents",
};

// Longitude correction for Ziwei time (see applyLongitudeCorrection):
// the birthplace longitude is used only to shift the clock time toward
// local solar time. No timezone database, no DST, and no equation of time
// are applied, so this is a longitude correction, not full true solar
// time. Callers must say so on the page.
export function applyLongitudeCorrection(
  date: string,
  hour: number,
  minute: number,
  longitude: number,
): { date: string; hour: number; minute: number; correctionMinutes: number; meridian: number } {
  const meridian = Math.round(longitude / 15) * 15;
  const correctionMinutes = Math.round(4 * (longitude - meridian) * 10) / 10;
  const total = hour * 60 + minute + correctionMinutes;
  let days = 0;
  let mins = total;
  if (mins < 0) {
    days = -1;
    mins += 1440;
  } else if (mins >= 1440) {
    days = 1;
    mins -= 1440;
  }
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  const outDate = d.toISOString().slice(0, 10);
  return {
    date: outDate,
    hour: Math.floor(mins / 60),
    minute: Math.round(mins % 60),
    correctionMinutes,
    meridian,
  };
}

export function timeIndexForHour(hour: number | null, minute = 0): number {
  if (hour === null) return 6; // noon double-hour, flagged as unknown by callers
  const h = hour + minute / 60;
  if (h >= 23 || h < 1) return 0;
  if (h < 3) return 1;
  if (h < 5) return 2;
  if (h < 7) return 3;
  if (h < 9) return 4;
  if (h < 11) return 5;
  if (h < 13) return 6;
  if (h < 15) return 7;
  if (h < 17) return 8;
  if (h < 19) return 9;
  if (h < 21) return 10;
  return 11;
}

function parseDate(date: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("date must be YYYY-MM-DD");
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new Error("date is not a real calendar date");
  }
  return { y, m, d };
}

export interface ZiweiStar {
  name: string;
  brightness: string;
  mutagen: string;
}
export interface ZiweiPalace {
  index: number;
  name: string;
  chineseName: string;
  heavenlyStem: string;
  earthlyBranch: string;
  majorStars: string[];
  majorStarsDetail: ZiweiStar[];
  minorStars: string[];
  isLifePalace: boolean;
}
export interface ZiweiResult {
  system: "ziwei";
  solarDate: string;
  lunarDate: string;
  chineseDate: string;
  zodiac: string;
  sign: string;
  timeLabel: string;
  unknownTime: boolean;
  solarCorrectionMinutes: number;
  solarCorrectedTime: string | null;
  palaces: ZiweiPalace[];
}

export function calculateZiwei(input: {
  date: string;
  hour: number | null;
  minute?: number;
  gender: ChartGender;
  longitude?: number;
}): ZiweiResult {
  // Longitude correction, when a birthplace longitude is supplied and the
  // time is known: shift the clock time before iztro picks its double-hour.
  // Unknown time stays at noon with no correction.
  let effDate = input.date;
  let effHour = input.hour;
  let effMinute = input.minute ?? 0;
  let correction = 0;
  if (input.hour !== null && typeof input.longitude === "number" && Number.isFinite(input.longitude)) {
    const c = applyLongitudeCorrection(input.date, input.hour, input.minute ?? 0, input.longitude);
    effDate = c.date;
    effHour = c.hour;
    effMinute = c.minute;
    correction = c.correctionMinutes;
  }
  const { y, m, d } = parseDate(effDate);
  const timeIndex = timeIndexForHour(effHour, effMinute);
  const genderName = input.gender === "female" ? "女" : "男";
  const solar = `${y}-${m}-${d}`;
  const astrolabe = astro.bySolar(solar, timeIndex, genderName);
  const soulBranch = astrolabe.earthlyBranchOfSoulPalace;
  return {
    system: "ziwei",
    solarDate: effDate,
    solarCorrectionMinutes: correction,
    solarCorrectedTime: input.hour === null ? null : `${String(effHour).padStart(2, "0")}:${String(effMinute).padStart(2, "0")}`,
    lunarDate: astrolabe.lunarDate,
    chineseDate: astrolabe.chineseDate,
    zodiac: astrolabe.zodiac,
    sign: astrolabe.sign,
    timeLabel: astrolabe.time,
    unknownTime: input.hour === null,
    palaces: (astrolabe.palaces as unknown[]).map((raw) => {
      const p = raw as {
        index: number;
        name: string;
        heavenlyStem: string;
        earthlyBranch: string;
        majorStars: { name: string; brightness: string; mutagen: string }[];
        minorStars: { name: string }[];
      };
      return {
        index: p.index,
        name: PALACE_EN[p.name] ?? p.name,
        chineseName: p.name,
        heavenlyStem: p.heavenlyStem,
        earthlyBranch: p.earthlyBranch,
        majorStars: p.majorStars.map((s) => s.name),
        majorStarsDetail: p.majorStars.map((s) => ({ name: s.name, brightness: s.brightness, mutagen: s.mutagen })),
        minorStars: p.minorStars.map((s) => s.name),
        isLifePalace: p.earthlyBranch === soulBranch,
      };
    }),
  };
}

const WESTERN_PLANETS = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"] as const;
export interface WesternPlanet {
  name: string;
  longitude: number;
  sign: string;
  house: number | null;
}
export interface WesternResult {
  system: "western";
  sunSign: string;
  ascendantSign: string;
  ascendantLongitude: number;
  midheavenSign: string;
  midheavenLongitude: number;
  unknownTime: boolean;
  planets: WesternPlanet[];
  cusps: number[];
  aspectCount: number;
}

export function calculateWestern(input: {
  date: string;
  hour: number | null;
  minute?: number;
  latitude: number;
  longitude: number;
}): WesternResult {
  const { y, m, d } = parseDate(input.date);
  if (input.latitude < -90 || input.latitude > 90 || input.longitude < -180 || input.longitude > 180) {
    throw new Error("latitude/longitude out of range");
  }
  const hour = input.hour ?? 12;
  const origin = new Origin({
    year: y,
    month: m - 1,
    date: d,
    hour,
    minute: input.minute ?? 0,
    latitude: input.latitude,
    longitude: input.longitude,
  });
  const horoscope = new Horoscope({ origin, houseSystem: "placidus", zodiac: "tropical" }) as unknown as {
    CelestialBodies: Record<string, {
      label: string;
      Sign: { label: string };
      ChartPosition: { Ecliptic: { DecimalDegrees: number } };
      House?: { id: number };
    }>;
    Houses: { ChartPosition: { StartPosition: { Ecliptic: { DecimalDegrees: number } } } }[];
    SunSign: { label: string };
    Ascendant: { Sign: { label: string }; ChartPosition: { Ecliptic: { DecimalDegrees: number } } };
    Midheaven: { Sign: { label: string }; ChartPosition: { Ecliptic: { DecimalDegrees: number } } };
    Aspects: { all: unknown[] };
  };
  const bodies = horoscope.CelestialBodies;
  const planets: WesternPlanet[] = WESTERN_PLANETS.filter((k) => bodies[k]).map((k) => ({
    name: bodies[k].label,
    longitude: bodies[k].ChartPosition.Ecliptic.DecimalDegrees,
    sign: bodies[k].Sign.label,
    house: bodies[k].House ? bodies[k].House.id : null,
  }));
  return {
    system: "western",
    sunSign: horoscope.SunSign.label,
    ascendantSign: horoscope.Ascendant.Sign.label,
    ascendantLongitude: horoscope.Ascendant.ChartPosition.Ecliptic.DecimalDegrees,
    midheavenSign: horoscope.Midheaven.Sign.label,
    midheavenLongitude: horoscope.Midheaven.ChartPosition.Ecliptic.DecimalDegrees,
    unknownTime: input.hour === null,
    planets,
    cusps: horoscope.Houses.map((h) => h.ChartPosition.StartPosition.Ecliptic.DecimalDegrees),
    aspectCount: horoscope.Aspects.all.length,
  };
}

export function calculateChart(input: ChartInput): ZiweiResult | WesternResult {
  if (input.system === "ziwei") {
    return calculateZiwei({ date: input.date, hour: input.hour, minute: input.minute, gender: input.gender, longitude: input.longitude });
  }
  return calculateWestern({ date: input.date, hour: input.hour, minute: input.minute, latitude: input.latitude, longitude: input.longitude });
}
