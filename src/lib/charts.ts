// Chart calculation only. No AI, no credits, no storage, no database.
// Birth data passed in here is used in-memory for this calculation only:
// callers must not persist it and must not send it to any AI prompt.
// See /charts page and /api/chart/calculate for the privacy note shown to users.
// Server-only: iztro and circular-natal-horoscope-js are CJS-only bundles,
// so they are loaded with createRequire (works in the Node route and in
// the Node test script; this file must not be imported by client components).
import { createRequire } from "node:module";
import { resolveBirthTime, solarWallTime, type TimeBasis } from "./timezone.ts";

const require = createRequire(import.meta.url);
// M3.3: the astrolabe type grows with the period APIs iztro
// actually exposes: horoscope(date) for decade/year/month/day/hour
// layers, and decadalList() for every decade with age and year
// ranges. Period palaceNames are a rotation of the natal ring:
// position j of a period's arrays maps to natal ring index
// (period.index + j - 1) mod 12, verified against iztro's own
// palace lookup (FunctionalHoroscope.palace) and against two
// anchors (decade 2026 palaceNames start at Fortune, annual 2026
// at Wealth, matching their indices 10 and 4).
interface IztroPeriod {
  index: number;
  name: string;
  heavenlyStem: string;
  earthlyBranch: string;
  palaceNames: string[];
  mutagen: string[];
  stars: Array<Array<{ name: string }>>;
}
interface IztroDecade {
  index: number;
  name: string;
  palaceName: string;
  ageRange: [number, number];
  yearRange: [number, number];
  heavenlyStem: string;
  earthlyBranch: string;
  palaceNames: string[];
  mutagen: string[];
  stars: Array<Array<{ name: string }>>;
}
interface IztroAstrolabe {
  lunarDate: string;
  chineseDate: string;
  zodiac: string;
  sign: string;
  time: string;
  earthlyBranchOfSoulPalace: string;
  palaces: unknown[];
  horoscope: (date: string) => {
    decadal: IztroPeriod;
    yearly: IztroPeriod;
    daily: IztroPeriod;
    age: { nominalAge: number };
  };
  decadalList: () => IztroDecade[];
}
const astro = (require("iztro") as { astro: unknown }).astro as {
  bySolar: (solar: string, timeIndex: number, gender: string) => IztroAstrolabe;
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
  // Optional user correction: an IANA zone name that wins over the
  // coordinate lookup. Invalid names are refused, never guessed.
  timeZone?: string;
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

// Longitude correction for Ziwei time (see buildZiweiAstrolabe):
// when no IANA zone can be resolved, the birthplace longitude is
// used only to shift the clock time toward local solar time. No
// timezone database, no DST, and no equation of time are applied in
// that fallback, so it is a longitude correction, not full true
// solar time. Callers must say so on the page. When a zone IS
// resolved (coordinates plus an optional user override), the civil
// time is converted to UTC with its historical offset, DST included,
// and solar time is UTC plus longitude / 15 hours; the equation of
// time is still not applied in either path.
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
  // Phase 4B (4.3): which time conversion was used. "iana" means the
  // civil time was converted with the historical offset of timeZone
  // (DST included); "longitude" means no zone could be resolved and
  // the old 4-minutes-per-degree correction was used instead.
  timeZone: string | null;
  utcOffsetMinutes: number | null;
  timeBasis: TimeBasis;
  palaces: ZiweiPalace[];
}

// M3.3: shared natal-chart builder. Extracted from calculateZiwei
// without changing its behaviour, so the stacks function builds
// exactly the same chart the chart page shows.
function buildZiweiAstrolabe(input: {
  date: string;
  hour: number | null;
  minute?: number;
  gender: ChartGender;
  longitude?: number;
  latitude?: number;
  timeZone?: string;
}): {
  astrolabe: IztroAstrolabe;
  effDate: string;
  effHour: number;
  effMinute: number;
  correction: number;
  timeZone: string | null;
  utcOffsetMinutes: number | null;
  timeBasis: TimeBasis;
} {
  // M1.2: Ziwei cannot be calculated without a birth hour. The twelve
  // palaces are placed by the two-hour branch, so a noon double-hour
  // layout would be a guess presented as a chart. Refuse honestly.
  if (input.hour === null) {
    throw new Error(
      "Ziwei needs a birth hour: the twelve palaces are placed by the two-hour branch you were born in, so a chart from an unknown hour would be a guess."
    );
  }
  // Phase 4B (4.3): civil time to solar time. With a latitude the
  // IANA zone is resolved from the coordinates (or the user's
  // override wins), the historical offset including DST converts the
  // clock time to UTC, and solar time is UTC plus longitude / 15
  // hours. Without a latitude there is nothing to look a zone up
  // from, so the old longitude-only correction runs instead and the
  // result says so (timeBasis "longitude").
  let effDate = input.date;
  let effHour = input.hour;
  let effMinute = input.minute ?? 0;
  let correction = 0;
  let timeZone: string | null = null;
  let utcOffsetMinutes: number | null = null;
  let timeBasis: TimeBasis = "longitude";
  if (typeof input.longitude === "number" && Number.isFinite(input.longitude)) {
    const resolved = resolveBirthTime({
      date: input.date,
      hour: input.hour,
      minute: input.minute ?? 0,
      latitude: input.latitude,
      longitude: input.longitude,
      timeZone: input.timeZone,
    });
    timeZone = resolved.timeZone;
    utcOffsetMinutes = resolved.utcOffsetMinutes;
    timeBasis = resolved.basis;
    if (resolved.basis === "iana") {
      const { y, m, d } = parseDate(input.date);
      const solar = solarWallTime(resolved.utc, input.longitude, Date.UTC(y, m - 1, d, input.hour, input.minute ?? 0));
      effDate = solar.date;
      effHour = solar.hour;
      effMinute = solar.minute;
      correction = solar.correctionMinutes;
    } else {
      const c = applyLongitudeCorrection(input.date, input.hour, input.minute ?? 0, input.longitude);
      effDate = c.date;
      effHour = c.hour;
      effMinute = c.minute;
      correction = c.correctionMinutes;
    }
  }
  const { y, m, d } = parseDate(effDate);
  const timeIndex = timeIndexForHour(effHour, effMinute);
  const genderName = input.gender === "female" ? "女" : "男";
  const solar = `${y}-${m}-${d}`;
  return { astrolabe: astro.bySolar(solar, timeIndex, genderName), effDate, effHour, effMinute, correction, timeZone, utcOffsetMinutes, timeBasis };
}

function mapZiweiPalaces(astrolabe: IztroAstrolabe): ZiweiPalace[] {
  const soulBranch = astrolabe.earthlyBranchOfSoulPalace;
  return (astrolabe.palaces as unknown[]).map((raw) => {
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
  });
}

export function calculateZiwei(input: {
  date: string;
  hour: number | null;
  minute?: number;
  gender: ChartGender;
  longitude?: number;
  latitude?: number;
  timeZone?: string;
}): ZiweiResult {
  const { astrolabe, effDate, effHour, effMinute, correction, timeZone, utcOffsetMinutes, timeBasis } = buildZiweiAstrolabe(input);
  return {
    system: "ziwei",
    solarDate: effDate,
    solarCorrectionMinutes: correction,
    solarCorrectedTime: input.hour === null ? null : `${String(effHour).padStart(2, "0")}:${String(effMinute).padStart(2, "0")}`,
    timeZone,
    utcOffsetMinutes,
    timeBasis,
    lunarDate: astrolabe.lunarDate,
    chineseDate: astrolabe.chineseDate,
    zodiac: astrolabe.zodiac,
    sign: astrolabe.sign,
    timeLabel: astrolabe.time,
    unknownTime: input.hour === null,
    palaces: mapZiweiPalaces(astrolabe),
  };
}

// M3.3: palace activation stacks. For one year, three layers over
// the same twelve natal palaces: the natal stars, the decade
// (Da Xian) layer, and the annual (Liu Nian) layer. The decade
// comes from iztro's decadalList (age and year ranges included);
// the annual layer comes from iztro's horoscope at June 1 of the
// year, the same representative date iztro's own yearlyList uses
// (June is safely inside that lunar year). The daily (Liu Ri)
// layer is included ONLY as rhythm: the palace and Si Hua of the
// day, with no interpretation, because a layer that changes daily
// is not a personal reading. Si Hua for every layer comes from
// iztro's own mutagen table for the layer's stem, in Lu, Quan,
// Ke, Ji order; Sortes never hand-rolls Si Hua and never mixes
// tables. Period stars are iztro's layer stars: 运 for the decade,
// 流 for the year (plus 年解, the annual Jie star), 日 for the day.
// A year outside the chart's decade range is refused
// instead of showing a stack from the wrong decade.
export interface ZiweiStackRow {
  index: number;
  name: string;
  chineseName: string;
  natalMajorStars: string[];
  decadeStars: string[];
  annualStars: string[];
  decadeActive: boolean;
  annualActive: boolean;
}

export interface ZiweiPeriodLayer {
  palaceName: string;
  palaceNameZh: string;
  index: number;
  heavenlyStem: string;
  earthlyBranch: string;
  // Si Hua stars for the layer's stem, in Lu, Quan, Ke, Ji order.
  mutagen: string[];
}

export interface ZiweiStacks {
  year: number;
  coveredYears: [number, number];
  decade: ZiweiPeriodLayer & { ageRange: [number, number]; yearRange: [number, number] };
  annual: ZiweiPeriodLayer;
  // Rhythm only: the daily palace for the requested day, no reading.
  daily: ZiweiPeriodLayer;
  dailyDate: string;
  stacks: ZiweiStackRow[];
}

export function calculateZiweiStacks(
  input: {
    date: string;
    hour: number | null;
    minute?: number;
    gender: ChartGender;
    longitude?: number;
    latitude?: number;
    timeZone?: string;
  },
  year: number,
  todayISO?: string
): ZiweiStacks {
  if (!Number.isInteger(year)) throw new Error("year must be an integer");
  const { astrolabe } = buildZiweiAstrolabe(input);
  const decades = astrolabe.decadalList();
  const decade = decades.find((d) => year >= d.yearRange[0] && year <= d.yearRange[1]);
  if (!decade) {
    throw new Error(
      `No decade covers ${year}: this chart's decades run ${decades[0].yearRange[0]} to ${decades[decades.length - 1].yearRange[1]}.`
    );
  }
  // June 1 of the year, unpadded as iztro's yearlyList passes it.
  const mid = astrolabe.horoscope(`${year}-6-1`);
  if (mid.decadal.index !== decade.index) {
    throw new Error("Decade mismatch inside the engine: refusing to show a stack from the wrong decade.");
  }
  const dailyDate = todayISO ? (() => { const p = parseDate(todayISO); return `${p.y}-${p.m}-${p.d}`; })() : (() => { const n = new Date(); return `${n.getUTCFullYear()}-${n.getUTCMonth() + 1}-${n.getUTCDate()}`; })();
  const daily = astrolabe.horoscope(dailyDate).daily;
  const natal = mapZiweiPalaces(astrolabe);
  const layer = (zh: string, index: number, stem: string, branch: string, mutagen: string[]): ZiweiPeriodLayer => ({
    palaceName: PALACE_EN[zh] ?? zh,
    palaceNameZh: zh,
    index,
    heavenlyStem: stem,
    earthlyBranch: branch,
    mutagen,
  });
  const natalNameAt = (index: number): string => natal.find((p) => p.index === index)?.chineseName ?? "";
  // Period position j maps to natal ring index (period.index + j - 1)
  // mod 12, so natal index n reads period position (n - index + 1)
  // mod 12. Verified against iztro's palace lookup.
  const starsAt = (period: IztroPeriod, natalIndex: number): string[] => {
    const j = (((natalIndex - period.index + 1) % 12) + 12) % 12;
    return (period.stars[j] ?? []).map((s) => s.name);
  };
  return {
    year,
    coveredYears: [decades[0].yearRange[0], decades[decades.length - 1].yearRange[1]],
    decade: {
      ...layer(decade.palaceName, decade.index, decade.heavenlyStem, decade.earthlyBranch, decade.mutagen),
      ageRange: decade.ageRange,
      yearRange: decade.yearRange,
    },
    annual: layer(natalNameAt(mid.yearly.index), mid.yearly.index, mid.yearly.heavenlyStem, mid.yearly.earthlyBranch, mid.yearly.mutagen),
    daily: layer(natalNameAt(daily.index), daily.index, daily.heavenlyStem, daily.earthlyBranch, daily.mutagen),
    dailyDate,
    stacks: natal.map((p) => ({
      index: p.index,
      name: p.name,
      chineseName: p.chineseName,
      natalMajorStars: p.majorStars,
      decadeStars: starsAt(mid.decadal, p.index),
      annualStars: starsAt(mid.yearly, p.index),
      decadeActive: p.index === decade.index,
      annualActive: p.index === mid.yearly.index,
    })),
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
  // Phase 4B (4.3): the zone the engine already resolved from the
  // coordinates, reported so the page can show it. The engine does
  // its own lookup with tz-lookup + moment-timezone (DST included);
  // this is display metadata, not a second conversion.
  timeZone: string | null;
  utcOffsetMinutes: number;
  timeBasis: TimeBasis;
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
  timeZone?: string;
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
  // Phase 4B (4.3): display metadata only. The engine below already
  // converts with a real timezone database including DST, from the
  // same coordinates; this resolves the same zone with the same
  // lookup so the page can name it.
  const resolved = resolveBirthTime({ date: input.date, hour, minute, latitude: input.latitude, longitude: input.longitude, timeZone: input.timeZone });
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
    timeZone: resolved.timeZone,
    utcOffsetMinutes: resolved.utcOffsetMinutes,
    timeBasis: resolved.basis,
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
    return calculateZiwei({ date: input.date, hour: input.hour, minute: input.minute, gender: input.gender, longitude: input.longitude, latitude: input.latitude, timeZone: input.timeZone });
  }
  return calculateWestern({ date: input.date, hour: input.hour, minute: input.minute, latitude: input.latitude, longitude: input.longitude, timeZone: input.timeZone });
}
