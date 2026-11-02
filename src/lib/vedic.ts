// Vedic (Jyotish) chart, calculation only. No AI, no credits, no storage.
// Engine: caelus 0.25.0, MIT, clean-room TypeScript, no Swiss Ephemeris
// code, no AGPL, no ephemeris files. Sidereal zodiac: Lahiri ayanamsa.
// Houses: whole sign, the standard Vedic D1 (rasi) presentation.
// Time limit, stated on the page: the birth clock time is converted to UT
// with a longitude offset only (longitude / 15 hours). No timezone
// database, no DST, and no historical timezone rules are applied, so a
// chart near a sign or nakshatra cusp may differ by one division from a
// timezone-exact calculation. Birth data is used in-memory only, exactly
// as for Ziwei and Western, and is never sent to any AI prompt.
// Server-only: caelus is ESM and is loaded here, not by client components.
import { Engine, nakshatra, vimshottariAt, julianDay } from "caelus";
import { embeddedData } from "caelus/data-embedded";

// Vimshottari dasha dates live here, not in a separate module, so
// node type stripping (used by scripts/charts-check.mjs) can load this
// file: it resolves package imports and explicit .ts paths, but not
// extensionless relative imports between source files.

const SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
];

export function signFromLongitude(lon: number): string {
  return SIGNS[Math.floor(((lon % 360) + 360) % 360 / 30)] ?? "Aries";
}

function signIndexOf(lon: number): number {
  return Math.floor((((lon % 360) + 360) % 360) / 30);
}

// M3.2: divisional charts (vargas), Parashara rules. Both are pure
// sign math on sidereal longitudes, so they are testable without an
// engine and they work for unknown-time charts too (planet signs do
// not need a Lagna; only the divisional Lagna does).
//
// Navamsa (D9): each sign splits into nine 3°20' parts. The first
// part starts at the sign itself for movable signs (Aries, Cancer,
// Libra, Capricorn), at the 9th sign from it for fixed signs
// (Taurus, Leo, Scorpio, Aquarius), and at the 5th from it for dual
// signs (Gemini, Virgo, Sagittarius, Pisces). Parts run forward in
// zodiac order. Movable/fixed/dual cycle every three signs, so
// index % 3 selects the type: 0 movable, 1 fixed, 2 dual.
// Navamsa parts are 30/9 degrees each, NOT the 13°20' nakshatra
// span: confusing the two gives the wrong pada for any planet past
// the first part of its sign.
const NAVAMSA_SPAN = 30 / 9;

export function navamsaSign(longitude: number): string {
  const norm = ((longitude % 360) + 360) % 360;
  const idx = Math.floor(norm / 30);
  const pada = Math.floor((norm - idx * 30) / NAVAMSA_SPAN);
  const type = idx % 3;
  const start = type === 0 ? idx : type === 1 ? (idx + 8) % 12 : (idx + 4) % 12;
  return SIGNS[(start + pada) % 12] ?? "Aries";
}

// Dasamsa (D10): each sign splits into ten 3° parts. Brihat Parashara
// Hora Shastra, Chap 6, Shloka 13-14: odd-numbered signs (Aries,
// Gemini, Leo, Libra, Sagittarius, Aquarius) start at the sign
// itself; even-numbered signs (Taurus, Cancer, Virgo, Scorpio,
// Capricorn, Pisces) start at the 9th sign from it. Parts run
// forward in zodiac order. Odd-numbered means 0-based even index.
export function dasamsaSign(longitude: number): string {
  const norm = ((longitude % 360) + 360) % 360;
  const idx = Math.floor(norm / 30);
  const part = Math.floor((norm - idx * 30) / 3);
  const start = idx % 2 === 0 ? idx : (idx + 8) % 12;
  return SIGNS[(start + part) % 12] ?? "Aries";
}

export interface DivisionalPlanet {
  name: string;
  d9: string;
  d9House: number | null;
  d10: string;
  d10House: number | null;
}

export interface DivisionalChart {
  lagnaD9: string | null;
  lagnaD10: string | null;
  planets: DivisionalPlanet[];
}

export function computeDivisionalChart(
  planets: Array<{ name: string; longitude: number }>,
  ascendantLongitude: number | null
): DivisionalChart {
  const lagnaD9 = ascendantLongitude === null ? null : navamsaSign(ascendantLongitude);
  const lagnaD10 = ascendantLongitude === null ? null : dasamsaSign(ascendantLongitude);
  const houseFrom = (divSign: string, lagna: string | null): number | null =>
    lagna === null ? null : ((SIGNS.indexOf(divSign) - SIGNS.indexOf(lagna) + 12) % 12) + 1;
  return {
    lagnaD9,
    lagnaD10,
    planets: planets.map((p) => {
      const d9 = navamsaSign(p.longitude);
      const d10 = dasamsaSign(p.longitude);
      return { name: p.name, d9, d9House: houseFrom(d9, lagnaD9), d10, d10House: houseFrom(d10, lagnaD10) };
    }),
  };
}

// M3.2: panchanga for one date, from sidereal Sun and Moon
// longitudes. Standard formulas, stated so they can be checked:
// tithi from Sun-Moon elongation (12° each, 30 tithis), nakshatra
// from Moon longitude (13°20' each, 27 nakshatras), yoga from
// Sun+Moon longitude (13°20' each, 27 yogas), karana from elongation
// (6° each, 60 karanas). The karana cycle does NOT start with Bava:
// the first half of Shukla Pratipada is Kimstughna, the next 56
// halves cycle the seven movable karanas eight times, and the last
// three halves are Shakuni, Chatushpada, and Naga. Getting this
// wrong shifts every karana by one: it was caught by comparing the
// 2026-11-03 noon-UTC karana against published panchanga tables,
// which say Vanija where the naive Bava-first mapping said Vishti.
// Vara is the weekday of the date.
const TITHI_NAMES = [
  "Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi",
  "Saptami", "Ashtami", "Navami", "Dashami", "Ekadashi", "Dwadashi",
  "Trayodashi", "Chaturdashi",
];
const NAKSHATRA_NAMES = [
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
  "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni",
  "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha",
  "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana",
  "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
];
const YOGA_NAMES = [
  "Vishkambha", "Priti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda",
  "Sukarma", "Dhriti", "Shula", "Ganda", "Vriddhi", "Dhruva", "Vyaghata",
  "Harshana", "Vajra", "Siddhi", "Vyatipata", "Variyana", "Parigha",
  "Shiva", "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma", "Indra", "Vaidhriti",
];
const KARANA_CYCLE = ["Bava", "Balava", "Kaulava", "Taitila", "Garaja", "Vanija", "Vishti"];
// Fixed karanas, in elongation order: Kimstughna opens the month
// (k = 0), then Shakuni, Chatushpada, Naga close it (k = 57, 58, 59).
const KARANA_FIXED_END = ["Shakuni", "Chatushpada", "Naga"];

export interface Panchanga {
  tithi: string;
  paksha: "Shukla" | "Krishna";
  nakshatra: string;
  yoga: string;
  karana: string;
  vara: string;
}

export function computePanchanga(
  sunLongitude: number,
  moonLongitude: number,
  dateISO: string
): Panchanga {
  const elong = (((moonLongitude - sunLongitude) % 360) + 360) % 360;
  const tithiIdx = Math.floor(elong / 12);
  const paksha: "Shukla" | "Krishna" = tithiIdx < 15 ? "Shukla" : "Krishna";
  const num = tithiIdx % 15;
  const tithi =
    num === 14
      ? paksha === "Shukla"
        ? "Purnima"
        : "Amavasya"
      : (TITHI_NAMES[num] ?? "Pratipada");
  const moonNorm = ((moonLongitude % 360) + 360) % 360;
  const nakIdx = Math.floor(moonNorm / NAKSHATRA_SPAN);
  const sumNorm = (((sunLongitude + moonLongitude) % 360) + 360) % 360;
  const yogaIdx = Math.floor(sumNorm / NAKSHATRA_SPAN);
  const karIdx = Math.floor(elong / 6);
  const karana =
    karIdx === 0
      ? "Kimstughna"
      : karIdx <= 56
        ? (KARANA_CYCLE[(karIdx - 1) % 7] ?? "Bava")
        : (KARANA_FIXED_END[karIdx - 57] ?? "Shakuni");
  const d = new Date(`${dateISO}T12:00:00Z`);
  const vara =
    ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getUTCDay()] ??
    "Monday";
  return {
    tithi,
    paksha,
    nakshatra: NAKSHATRA_NAMES[nakIdx] ?? "Ashwini",
    yoga: YOGA_NAMES[yogaIdx] ?? "Vishkambha",
    karana,
    vara,
  };
}

// M3.2: Gochara, transit-to-natal for Vedic charts. Sign-based, not
// degree-based: Vedic aspects (Graha Drishti) are counted in signs,
// with no orbs. Every planet aspects the 7th sign from itself; Mars
// adds the 4th and 8th, Jupiter the 5th and 9th, Saturn the 3rd and
// 10th. Nodes aspect by the 7th sign only in this view: their
// 5th/9th aspects are debated, so they are not claimed. Transit
// positions come from caelus at 12:00 UTC on the chosen date (the
// same stated noon-UTC reference as Western transits). Houses from
// the natal Moon are counted in signs from the natal Moon sign.
// No favorable or unfavorable verdicts are attached: this view
// shows positions and sign aspects only.
const DRISHTI: Record<string, number[]> = {
  sun: [7],
  moon: [7],
  mercury: [7],
  venus: [7],
  mars: [4, 7, 8],
  jupiter: [5, 7, 9],
  saturn: [3, 7, 10],
  rahu: [7],
  ketu: [7],
};

export interface GocharaAspect {
  natalPlanet: string;
  housesAway: number;
}

export interface GocharaPlanet {
  name: string;
  longitude: number;
  sign: string;
  houseFromMoon: number;
  aspects: GocharaAspect[];
}

export interface GocharaResult {
  date: string;
  panchanga: Panchanga;
  planets: GocharaPlanet[];
}

export function computeGochara(
  natalMoonLongitude: number,
  natalPlanets: Array<{ name: string; longitude: number }>,
  dateISO: string
): GocharaResult {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO);
  if (!match) throw new Error("date must be YYYY-MM-DD");
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new Error("date is not a real calendar date");
  }
  const e = getEngine();
  const chart = e.chart(y, m, d, 12, 0, 0, 0, 0, {
    houseSystem: "whole_sign",
    zodiac: "sidereal:lahiri",
  });
  const bodies = chart.bodies as Record<string, { lon: number; sign: string }>;
  const names = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"] as const;
  const transit: Array<{ name: string; longitude: number; sign: string }> = names
    .filter((k) => bodies[k])
    .map((k) => ({ name: k, longitude: bodies[k].lon, sign: bodies[k].sign }));
  const rahuLon = (bodies.true_node ?? bodies.mean_node)?.lon;
  if (typeof rahuLon === "number") {
    const ketuLon = (rahuLon + 180) % 360;
    transit.push({ name: "rahu", longitude: rahuLon, sign: signFromLongitude(rahuLon) });
    transit.push({ name: "ketu", longitude: ketuLon, sign: signFromLongitude(ketuLon) });
  }
  const natalMoonSignIdx = signIndexOf(natalMoonLongitude);
  const planets: GocharaPlanet[] = transit.map((t) => {
    const tIdx = signIndexOf(t.longitude);
    const houseFromMoon = ((tIdx - natalMoonSignIdx + 12) % 12) + 1;
    const rule = DRISHTI[t.name] ?? [7];
    const aspects: GocharaAspect[] = [];
    for (const n of natalPlanets) {
      const nIdx = signIndexOf(n.longitude);
      const away = ((nIdx - tIdx + 12) % 12) + 1;
      if (rule.includes(away)) aspects.push({ natalPlanet: n.name, housesAway: away });
    }
    return { name: t.name, longitude: t.longitude, sign: t.sign, houseFromMoon, aspects };
  });
  const sunT = transit.find((t) => t.name === "sun");
  const moonT = transit.find((t) => t.name === "moon");
  if (!sunT || !moonT) throw new Error("transit calculation returned no Sun or Moon");
  return {
    date: dateISO,
    panchanga: computePanchanga(sunT.longitude, moonT.longitude, dateISO),
    planets,
  };
}

// Vimshottari dasha dates: pure computation from Moon longitude and
// the birth local date. Convention, stated plainly: one Vimshottari
// year is 365.25 days, the usual programmatic convention. Dates are
// calendar dates (YYYY-MM-DD) computed in UTC so no local timezone
// shifts them. Cycle order and lord years (120 years total): Ketu 7,
// Venus 20, Sun 6, Moon 10, Mars 7, Rahu 18, Jupiter 16, Saturn 19,
// Mercury 17. Nakshatras run in the same lord order: Ashwini is Ketu,
// Bharani is Venus, and so on, repeating every 9 nakshatras.
export type DashaPeriod = {
  lord: string;
  start: string;
  end: string;
};

const DASHA_LORDS = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"] as const;
const DASHA_YEARS: Record<string, number> = {
  Ketu: 7,
  Venus: 20,
  Sun: 6,
  Moon: 10,
  Mars: 7,
  Rahu: 18,
  Jupiter: 16,
  Saturn: 19,
  Mercury: 17,
};
const NAKSHATRA_SPAN = 360 / 27;
const DASHA_YEAR_MS = 365.25 * 24 * 3600 * 1000;

export type DashaTimeline = {
  periods: DashaPeriod[];
  currentMahadasha: DashaPeriod | null;
  currentAntardasha: DashaPeriod | null;
};

// Moon longitude in degrees (sidereal, as caelus reports it) plus the
// birth local date and the as-of date, both YYYY-MM-DD.
export function computeDashaTimeline(
  moonLongitude: number,
  birthDateISO: string,
  asOfISO: string
): DashaTimeline {
  const moon = ((moonLongitude % 360) + 360) % 360;
  const nakIndex = Math.floor(moon / NAKSHATRA_SPAN);
  const nakStart = nakIndex * NAKSHATRA_SPAN;
  const elapsed = (moon - nakStart) / NAKSHATRA_SPAN;
  const birthLord = DASHA_LORDS[nakIndex % 9];
  const parseDay = (iso: string): number => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
  const birthMs = parseDay(birthDateISO);
  const asOfMs = parseDay(asOfISO);

  // Walk the cycle from birth: the first period is the remainder of
  // the birth lord's dasha, then full periods in cycle order. Stop
  // after two full cycles (18 entries), which covers any lifetime.
  const periods: DashaPeriod[] = [];
  let lordIdx = DASHA_LORDS.indexOf(birthLord);
  let cursor = birthMs;
  let first = true;
  for (let i = 0; i < 18; i++) {
    const lord = DASHA_LORDS[lordIdx % 9];
    const years = first ? DASHA_YEARS[lord] * (1 - elapsed) : DASHA_YEARS[lord];
    const end = cursor + years * DASHA_YEAR_MS;
    periods.push({ lord, start: isoDay(cursor), end: isoDay(end) });
    cursor = end;
    first = false;
    lordIdx++;
  }

  const currentMahadasha =
    periods.find((p) => asOfMs >= parseDay(p.start) && asOfMs < parseDay(p.end)) ?? null;

  // Antardashas inside the current mahadasha, in standard order
  // starting from the mahadasha lord. Each antardasha lasts
  // (mahadasha years times lord years) divided by 120.
  let currentAntardasha: DashaPeriod | null = null;
  if (currentMahadasha) {
    const mahaYears = (parseDay(currentMahadasha.end) - parseDay(currentMahadasha.start)) / DASHA_YEAR_MS;
    const startIdx = DASHA_LORDS.indexOf(currentMahadasha.lord as (typeof DASHA_LORDS)[number]);
    let aCursor = parseDay(currentMahadasha.start);
    for (let i = 0; i < 9; i++) {
      const lord = DASHA_LORDS[(startIdx + i) % 9];
      const aEnd = aCursor + (mahaYears * DASHA_YEARS[lord]) / 120 * DASHA_YEAR_MS;
      if (asOfMs >= aCursor && asOfMs < aEnd) {
        currentAntardasha = { lord, start: isoDay(aCursor), end: isoDay(aEnd) };
        break;
      }
      aCursor = aEnd;
    }
  }

  return { periods, currentMahadasha, currentAntardasha };
}

export interface VedicPlanet {
  name: string;
  longitude: number;
  sign: string;
  house: number | null;
  // M1.2: direction of motion, from a second caelus chart 24 hours
  // later. True when the longitude decreases (apparent retrograde).
  retrograde: boolean;
}

export interface VedicResult {
  system: "vedic";
  sunSign: string;
  moonSign: string;
  // M1.2: null when birth time is unknown. No noon-derived Lagna.
  ascendantSign: string | null;
  // M3.2: sidereal longitude of the Lagna, for divisional charts.
  // Null when birth time is unknown, like the sign.
  ascendantLongitude: number | null;
  // M3.2: Navamsa (D9) and Dasamsa (D10) for every planet, plus the
  // divisional Lagnas when the birth time is known. Computed from
  // the natal positions, so no extra fetch is needed to show them.
  divisional: DivisionalChart;
  moonNakshatra: string;
  moonNakshatraPada: number;
  moonNakshatraLord: string;
  currentDasha: string;
  dashaAsOf: string;
  // M1.2: mahadasha timeline with start and end dates, plus the
  // current antardasha. Computed from Moon longitude in dasha.ts.
  dashaTimeline: DashaPeriod[];
  currentAntardasha: DashaPeriod | null;
  unknownTime: boolean;
  planets: VedicPlanet[];
  // Empty when birth time is unknown: no noon-derived houses.
  cusps: number[];
}

let engine: Engine | null = null;
function getEngine(): Engine {
  if (!engine) engine = new Engine(embeddedData);
  return engine;
}

export function calculateVedic(input: {
  date: string;
  hour: number | null;
  minute?: number;
  latitude: number;
  longitude: number;
}): VedicResult {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.date);
  if (!match) throw new Error("date must be YYYY-MM-DD");
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (input.latitude < -90 || input.latitude > 90 || input.longitude < -180 || input.longitude > 180) {
    throw new Error("latitude/longitude out of range");
  }
  // Local clock time to UT, longitude offset only (see limit above).
  // M1.2: unknown time still uses noon as a stand-in for planet
  // positions only. Lagna and houses are withheld, never noon-derived.
  const unknown = input.hour === null;
  const localHour = input.hour ?? 12;
  const localMinute = input.minute ?? 0;
  const local = new Date(Date.UTC(y, m - 1, d, localHour, localMinute, 0));
  const ut = new Date(local.getTime() - (input.longitude / 15) * 3600 * 1000);
  const e = getEngine();
  const buildChart = (when: Date) =>
    e.chart(
      when.getUTCFullYear(),
      when.getUTCMonth() + 1,
      when.getUTCDate(),
      when.getUTCHours(),
      when.getUTCMinutes(),
      0,
      input.latitude,
      input.longitude,
      { houseSystem: "whole_sign", zodiac: "sidereal:lahiri" },
    );
  const chart = buildChart(ut);
  const bodies = chart.bodies as Record<string, { lon: number; sign: string; house: number }>;
  // M1.2 retrograde: same UT moment 24 hours later. A negative
  // wrap-aware longitude change means apparent retrograde motion.
  // Nodes regress by nature, so the same test covers them.
  const later = buildChart(new Date(ut.getTime() + 24 * 3600 * 1000));
  const laterBodies = later.bodies as Record<string, { lon: number }>;
  const norm180 = (x: number) => ((x + 540) % 360) - 180;
  const retroOf = (name: string, lon: number): boolean => {
    const laterLon = laterBodies[name]?.lon;
    return typeof laterLon === "number" ? norm180(laterLon - lon) < 0 : false;
  };
  // Caelus returns dasha and lord names lower-case (saturn, mercury).
  // Display capitalises them; the calculation itself is unchanged.
  const cap = (s: string | null | undefined) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
  const names = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"] as const;
  const planets: VedicPlanet[] = names
    .filter((k) => bodies[k])
    .map((k) => ({
      name: k,
      longitude: bodies[k].lon,
      sign: bodies[k].sign,
      house: unknown ? null : bodies[k].house ?? null,
      retrograde: retroOf(k, bodies[k].lon),
    }));
  // Rahu is the north node; Ketu is its exact opposite point.
  // Positions keep the existing true-node preference. Direction uses
  // the MEAN node when available: the true node wobbles and can move
  // direct for days, while the mean node always regresses, which is
  // the standard "nodes are always retrograde" convention. Ketu
  // mirrors Rahu exactly, so it shares the flag.
  const rahuLon = (bodies.true_node ?? bodies.mean_node)?.lon;
  const meanRahuLon = bodies.mean_node?.lon;
  const laterMeanRahuLon = laterBodies.mean_node?.lon;
  const rahuRetro =
    typeof meanRahuLon === "number" && typeof laterMeanRahuLon === "number"
      ? norm180(laterMeanRahuLon - meanRahuLon) < 0
      : true;
  if (typeof rahuLon === "number") {
    const ketuLon = (rahuLon + 180) % 360;
    const rahuHouse = !unknown && chart.cusps ? Math.floor(((rahuLon - chart.cusps[0] + 360) % 360) / 30) + 1 : null;
    const ketuHouse = !unknown && chart.cusps ? Math.floor(((ketuLon - chart.cusps[0] + 360) % 360) / 30) + 1 : null;
    planets.push({ name: "rahu", longitude: rahuLon, sign: signFromLongitude(rahuLon), house: rahuHouse, retrograde: rahuRetro });
    planets.push({ name: "ketu", longitude: ketuLon, sign: signFromLongitude(ketuLon), house: ketuHouse, retrograde: rahuRetro });
  }
  const moonLon = bodies.moon.lon;
  const nak = nakshatra(moonLon);
  const natalJd = julianDay(ut.getUTCFullYear(), ut.getUTCMonth() + 1, ut.getUTCDate(), ut.getUTCHours(), ut.getUTCMinutes(), 0);
  const now = new Date();
  const dashaAsOf = now.toISOString().slice(0, 10);
  const dasha = vimshottariAt(
    e,
    natalJd,
    julianDay(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(), 0, 0, 0),
    "sidereal:lahiri",
  );
  const currentDasha = [dasha.maha, dasha.antar, dasha.pratyantar].filter(Boolean).map(cap).join(" / ");
  // M1.2: dated timeline from the same Moon longitude, so the
  // interpretation can name when periods start and end.
  const timeline = computeDashaTimeline(moonLon, input.date, dashaAsOf);
  // M3.2: divisional chart from the same natal positions.
  const ascendantLongitude = unknown ? null : chart.angles.asc;
  const divisional = computeDivisionalChart(planets, ascendantLongitude);
  return {
    system: "vedic",
    sunSign: bodies.sun.sign,
    moonSign: bodies.moon.sign,
    ascendantSign: unknown ? null : signFromLongitude(chart.angles.asc),
    ascendantLongitude,
    divisional,
    moonNakshatra: nak.name,
    moonNakshatraPada: nak.pada,
    moonNakshatraLord: cap(nak.lord),
    currentDasha,
    dashaAsOf,
    dashaTimeline: timeline.periods,
    currentAntardasha: timeline.currentAntardasha,
    unknownTime: unknown,
    planets,
    cusps: unknown ? [] : chart.cusps ?? [],
  };
}
