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
  return {
    system: "vedic",
    sunSign: bodies.sun.sign,
    moonSign: bodies.moon.sign,
    ascendantSign: unknown ? null : signFromLongitude(chart.angles.asc),
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
