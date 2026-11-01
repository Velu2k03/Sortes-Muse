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

export interface VedicPlanet {
  name: string;
  longitude: number;
  sign: string;
  house: number | null;
}

export interface VedicResult {
  system: "vedic";
  sunSign: string;
  moonSign: string;
  ascendantSign: string;
  moonNakshatra: string;
  moonNakshatraPada: number;
  moonNakshatraLord: string;
  currentDasha: string;
  dashaAsOf: string;
  unknownTime: boolean;
  planets: VedicPlanet[];
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
  const localHour = input.hour ?? 12;
  const localMinute = input.minute ?? 0;
  const local = new Date(Date.UTC(y, m - 1, d, localHour, localMinute, 0));
  const ut = new Date(local.getTime() - (input.longitude / 15) * 3600 * 1000);
  const e = getEngine();
  const chart = e.chart(
    ut.getUTCFullYear(),
    ut.getUTCMonth() + 1,
    ut.getUTCDate(),
    ut.getUTCHours(),
    ut.getUTCMinutes(),
    0,
    input.latitude,
    input.longitude,
    { houseSystem: "whole_sign", zodiac: "sidereal:lahiri" },
  );
  const bodies = chart.bodies as Record<string, { lon: number; sign: string; house: number }>;
  // Caelus returns dasha and lord names lower-case (saturn, mercury).
  // Display capitalises them; the calculation itself is unchanged.
  const cap = (s: string | null | undefined) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
  const names = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"] as const;
  const planets: VedicPlanet[] = names
    .filter((k) => bodies[k])
    .map((k) => ({ name: k, longitude: bodies[k].lon, sign: bodies[k].sign, house: bodies[k].house ?? null }));
  // Rahu is the north node; Ketu is its exact opposite point.
  const rahuLon = (bodies.true_node ?? bodies.mean_node)?.lon;
  if (typeof rahuLon === "number") {
    const ketuLon = (rahuLon + 180) % 360;
    const rahuHouse = chart.cusps ? Math.floor(((rahuLon - chart.cusps[0] + 360) % 360) / 30) + 1 : null;
    const ketuHouse = chart.cusps ? Math.floor(((ketuLon - chart.cusps[0] + 360) % 360) / 30) + 1 : null;
    planets.push({ name: "rahu", longitude: rahuLon, sign: signFromLongitude(rahuLon), house: rahuHouse });
    planets.push({ name: "ketu", longitude: ketuLon, sign: signFromLongitude(ketuLon), house: ketuHouse });
  }
  const moonLon = bodies.moon.lon;
  const nak = nakshatra(moonLon);
  const natalJd = julianDay(ut.getUTCFullYear(), ut.getUTCMonth() + 1, ut.getUTCDate(), ut.getUTCHours(), ut.getUTCMinutes(), 0);
  const now = new Date();
  const dasha = vimshottariAt(
    e,
    natalJd,
    julianDay(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(), 0, 0, 0),
    "sidereal:lahiri",
  );
  const currentDasha = [dasha.maha, dasha.antar, dasha.pratyantar].filter(Boolean).map(cap).join(" / ");
  return {
    system: "vedic",
    sunSign: bodies.sun.sign,
    moonSign: bodies.moon.sign,
    ascendantSign: signFromLongitude(chart.angles.asc),
    moonNakshatra: nak.name,
    moonNakshatraPada: nak.pada,
    moonNakshatraLord: cap(nak.lord),
    currentDasha,
    dashaAsOf: now.toISOString().slice(0, 10),
    unknownTime: input.hour === null,
    planets,
    cusps: chart.cusps ?? [],
  };
}
