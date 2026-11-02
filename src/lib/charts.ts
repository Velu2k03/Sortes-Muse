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
  // M1.2: Ziwei cannot be calculated without a birth hour. The twelve
  // palaces are placed by the two-hour branch, so a noon double-hour
  // layout would be a guess presented as a chart. Refuse honestly.
  if (input.hour === null) {
    throw new Error(
      "Ziwei needs a birth hour: the twelve palaces are placed by the two-hour branch you were born in, so a chart from an unknown hour would be a guess."
    );
  }
  // Longitude correction, when a birthplace longitude is supplied:
  // shift the clock time before iztro picks its double-hour.
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
  // M1.2: direction of motion, from a second calculation 24 hours
  // later. True when the longitude decreases (apparent retrograde).
  retrograde: boolean;
}
export interface WesternAspect {
  planet1: string;
  planet2: string;
  label: string;
  orb: number;
}
export interface WesternResult {
  system: "western";
  sunSign: string;
  // M1.2: null when birth time is unknown. Noon-derived angles are
  // no longer presented as the seeker's Rising or Midheaven.
  ascendantSign: string | null;
  ascendantLongitude: number | null;
  midheavenSign: string | null;
  midheavenLongitude: number | null;
  unknownTime: boolean;
  planets: WesternPlanet[];
  // Empty when birth time is unknown: no noon-derived houses.
  cusps: number[];
  aspectCount: number;
  aspects: WesternAspect[];
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
  // M1.2: unknown time still uses noon as a stand-in for planet
  // positions only. Angles and houses are withheld, never noon-derived.
  const unknown = input.hour === null;
  const hour = input.hour ?? 12;
  const minute = input.minute ?? 0;
  const build = (yy: number, mm: number, dd: number) => {
    const origin = new Origin({
      year: yy,
      month: mm - 1,
      date: dd,
      hour,
      minute,
      latitude: input.latitude,
      longitude: input.longitude,
    });
    return new Horoscope({ origin, houseSystem: "placidus", zodiac: "tropical" }) as {
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
      Aspects: { all: { point1Label: string; point2Label: string; label: string; orb: number }[] };
    };
  };
  const horoscope = build(y, m, d);
  // M1.2 retrograde: same local clock one day later. A negative
  // wrap-aware longitude change means apparent retrograde motion.
  const nextDay = new Date(Date.UTC(y, m - 1, d));
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const later = build(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate()
  );
  const norm180 = (x: number) => ((x + 540) % 360) - 180;
  const bodies = horoscope.CelestialBodies;
  const laterBodies = later.CelestialBodies;
  const planets: WesternPlanet[] = WESTERN_PLANETS.filter((k) => bodies[k]).map((k) => {
    const lon = bodies[k].ChartPosition.Ecliptic.DecimalDegrees;
    const laterLon = laterBodies[k]?.ChartPosition.Ecliptic.DecimalDegrees;
    return {
      name: bodies[k].label,
      longitude: lon,
      sign: bodies[k].Sign.label,
      house: unknown ? null : bodies[k].House ? bodies[k].House.id : null,
      retrograde: typeof laterLon === "number" ? norm180(laterLon - lon) < 0 : false,
    };
  });
  return {
    system: "western",
    sunSign: horoscope.SunSign.label,
    ascendantSign: unknown ? null : horoscope.Ascendant.Sign.label,
    ascendantLongitude: unknown ? null : horoscope.Ascendant.ChartPosition.Ecliptic.DecimalDegrees,
    midheavenSign: unknown ? null : horoscope.Midheaven.Sign.label,
    midheavenLongitude: unknown ? null : horoscope.Midheaven.ChartPosition.Ecliptic.DecimalDegrees,
    unknownTime: unknown,
    planets,
    cusps: unknown ? [] : horoscope.Houses.map((h) => h.ChartPosition.StartPosition.Ecliptic.DecimalDegrees),
    aspectCount: horoscope.Aspects.all.length,
    // Exposing the library's own aspect list, not new math: the count
    // alone told the user nothing, so the list is shown collapsibly.
    aspects: horoscope.Aspects.all.map((a) => ({
      planet1: a.point1Label,
      planet2: a.point2Label,
      label: a.label,
      orb: a.orb,
    })),
  };
}

// M3.1: transit-to-natal aspects. Transit positions are computed
// with calculateWestern at latitude 0, longitude 0, 12:00 local time,
// which at Greenwich is 12:00 UTC: a stated, geocentric noon-UTC
// reference. Houses and angles are never used here, only planet
// longitudes, so the reference location barely matters (the Moon's
// topocentric shift is about a degree at most). The Moon moves about
// 13 degrees a day, so same-day Moon aspects are approximate by
// nature; the UI must say so. Aspect orbs are published here, not
// hidden: conjunction 6, sextile 4, square 5, trine 5, opposition 6.
// A pair matches at most one aspect by geometry (angles are at least
// 30 degrees apart, orbs sum to at most 11).
export interface TransitPlanet {
  name: string;
  longitude: number;
  sign: string;
  retrograde: boolean;
}
export interface TransitAspect {
  transitPlanet: string;
  natalPlanet: string;
  aspect: string;
  orb: number;
  state: "applying" | "separating" | "steady";
}
export interface TransitResult {
  date: string;
  transitPlanets: TransitPlanet[];
  moonSign: string;
  aspects: TransitAspect[];
}

const TRANSIT_ASPECTS = [
  { name: "conjunction", angle: 0, orb: 6 },
  { name: "sextile", angle: 60, orb: 4 },
  { name: "square", angle: 90, orb: 5 },
  { name: "trine", angle: 120, orb: 5 },
  { name: "opposition", angle: 180, orb: 6 },
] as const;

function norm360(x: number): number {
  return ((x % 360) + 360) % 360;
}

function angularSeparation(a: number, b: number): number {
  const diff = Math.abs(norm360(a) - norm360(b));
  return Math.min(diff, 360 - diff);
}

export function computeTransits(
  natalPlanets: Array<{ name: string; longitude: number }>,
  date: string
): TransitResult {
  if (!Array.isArray(natalPlanets) || natalPlanets.length === 0) {
    throw new Error("natalPlanets must be a non-empty array");
  }
  for (const p of natalPlanets) {
    if (!p || typeof p.name !== "string" || !p.name || typeof p.longitude !== "number" || !Number.isFinite(p.longitude)) {
      throw new Error("each natal planet needs a name and a finite longitude");
    }
  }
  const { y, m, d } = parseDate(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  const atDate = (yy: number, mm: number, dd: number) =>
    calculateWestern({ date: `${yy}-${pad(mm)}-${pad(dd)}`, hour: 12, minute: 0, latitude: 0, longitude: 0 });
  const now = atDate(y, m, d);
  const next = new Date(Date.UTC(y, m - 1, d));
  next.setUTCDate(next.getUTCDate() + 1);
  const later = atDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  const laterByName = new Map(later.planets.map((p) => [p.name, p.longitude]));

  const aspects: TransitAspect[] = [];
  for (const t of now.planets) {
    const laterLon = laterByName.get(t.name);
    for (const n of natalPlanets) {
      const sep = angularSeparation(t.longitude, n.longitude);
      for (const asp of TRANSIT_ASPECTS) {
        const orb = Math.abs(sep - asp.angle);
        if (orb > asp.orb) continue;
        let state: TransitAspect["state"] = "steady";
        if (typeof laterLon === "number") {
          const sepLater = angularSeparation(laterLon, n.longitude);
          const orbLater = Math.abs(sepLater - asp.angle);
          if (orbLater < orb - 0.001) state = "applying";
          else if (orbLater > orb + 0.001) state = "separating";
        }
        aspects.push({
          transitPlanet: t.name,
          natalPlanet: n.name,
          aspect: asp.name,
          orb: Math.round(orb * 100) / 100,
          state,
        });
      }
    }
  }
  aspects.sort((a, b) => a.orb - b.orb);
  // The Moon is always among the ten bodies; a missing Moon means the
  // engine itself failed, so fail loudly instead of naming a wrong sign.
  const moon = now.planets.find((p) => p.name === "Moon");
  if (!moon) throw new Error("transit calculation returned no Moon");
  return {
    date,
    transitPlanets: now.planets.map((p) => ({
      name: p.name,
      longitude: p.longitude,
      sign: p.sign,
      retrograde: p.retrograde,
    })),
    moonSign: moon.sign,
    aspects,
  };
}

export function calculateChart(input: ChartInput): ZiweiResult | WesternResult {
  if (input.system === "ziwei") {
    return calculateZiwei({ date: input.date, hour: input.hour, minute: input.minute, gender: input.gender, longitude: input.longitude });
  }
  return calculateWestern({ date: input.date, hour: input.hour, minute: input.minute, latitude: input.latitude, longitude: input.longitude });
}
