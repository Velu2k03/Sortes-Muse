// Birth-time timezone resolution. Server-only, pure functions, no DOM.
// Problem it fixes (Phase 4B, 4.3): Vedic converted local clock time
// to UT by longitude only (longitude / 15 hours) and Ziwei corrected
// by 4 minutes per degree from the nearest 15-degree meridian. Both
// ignore civil timezones and DST, so a summer birth in New York was
// off by almost an hour (EDT is UTC-4, longitude says UTC-4:56).
// Western was already correct: circular-natal-horoscope-js resolves
// the zone from coordinates with tz-lookup and applies historical
// offsets with moment-timezone, verified by its Origin source and by
// a live Sun-longitude check, so this module does not touch it.
//
// Approach, zero new dependencies: tz-lookup 6.1.25 (CC0-1.0, already
// in the dependency tree as a dependency of
// circular-natal-horoscope-js, now also a direct dependency) maps
// coordinates to an IANA zone, and the Intl API
// (Intl.DateTimeFormat with timeZone) gives the historical UTC offset
// for the birth date, DST included. Node ships full ICU data, so no
// tz database is bundled. If the zone cannot be resolved (out-of-
// range coordinates, or a lookup failure), the caller falls back to
// the old longitude-only conversion and MUST say so: the result
// carries basis "longitude" and timeZone null, and the UI shows that
// assumption with a way to correct it. Birth times are never silently
// shifted: an explicit zone override that is not a real IANA name
// throws instead of guessing.
//
// DST edge conventions, pinned in timezone.test.ts: a wall time that
// never happens (spring-forward gap) resolves to the first valid
// wall time after the gap; a wall time that happens twice (fall-back)
// resolves to its first occurrence. Both are deterministic, and the
// returned offset always matches the returned UTC instant.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tzlookup = require("tz-lookup") as (latitude: number, longitude: number) => string;

export type TimeBasis = "iana" | "longitude";

export interface ResolvedBirthTime {
  /** The birth moment in UTC. */
  utc: Date;
  /** IANA zone used, or null when the longitude fallback was used. */
  timeZone: string | null;
  /** UTC offset in minutes at the birth moment (civil offset for IANA,
      longitude / 15 * 60 for the fallback). */
  utcOffsetMinutes: number;
  basis: TimeBasis;
}

function parseDateStrict(date: string): { y: number; m: number; d: number } {
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

/** IANA zone for coordinates, or null when they are out of range or
    the lookup fails. Oceans resolve to Etc/GMT zones, not null. */
export function lookupTimeZone(latitude: number, longitude: number): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  try {
    const zone = tzlookup(latitude, longitude);
    return typeof zone === "string" && zone.length > 0 ? zone : null;
  } catch {
    return null;
  }
}

/** True when the name is a real IANA timezone (Intl throws otherwise). */
export function isValidTimeZone(name: string): boolean {
  if (typeof name !== "string" || name.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/** UTC offset in whole minutes of a zone at a given UTC instant. */
export function utcOffsetMinutesAt(timeZone: string, utcMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) parts[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUTC - utcMs) / 60000);
}

/** Local wall time to UTC, resolving the zone's offset for that date
    (DST included). See the module header for gap/ambiguous conventions. */
export function localWallTimeToUtc(
  date: string,
  hour: number,
  minute: number,
  timeZone: string,
): { utcMs: number; utcOffsetMinutes: number } {
  if (!isValidTimeZone(timeZone)) throw new Error(`Unknown timezone: ${timeZone}`);
  const { y, m, d } = parseDateStrict(date);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error("hour must be 0-23");
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error("minute must be 0-59");
  const wallAsUtc = Date.UTC(y, m - 1, d, hour, minute);
  let guess = wallAsUtc;
  for (let i = 0; i < 3; i++) {
    const offset = utcOffsetMinutesAt(timeZone, guess);
    const next = wallAsUtc - offset * 60000;
    if (next === guess) break;
    guess = next;
  }
  // The offset is re-read at the final instant, so it always matches
  // the returned UTC time (a gap time's iterations end on the other
  // side of the transition from where they started).
  return { utcMs: guess, utcOffsetMinutes: utcOffsetMinutesAt(timeZone, guess) };
}

/** Resolve a birth wall time to UTC. An explicit zone override wins
    when given (and throws when it is not a real IANA name); otherwise
    the zone is looked up from the coordinates when a latitude is
    supplied; when no zone can be resolved, the old longitude-only
    conversion is used and reported as basis "longitude". */
export function resolveBirthTime(input: {
  date: string;
  hour: number;
  minute?: number;
  latitude?: number;
  longitude: number;
  timeZone?: string;
}): ResolvedBirthTime {
  const minute = input.minute ?? 0;
  const override = typeof input.timeZone === "string" ? input.timeZone.trim() : "";
  if (override) {
    if (!isValidTimeZone(override)) throw new Error(`Unknown timezone: ${override}`);
    const { utcMs, utcOffsetMinutes } = localWallTimeToUtc(input.date, input.hour, minute, override);
    return { utc: new Date(utcMs), timeZone: override, utcOffsetMinutes, basis: "iana" };
  }
  const zone =
    typeof input.latitude === "number" ? lookupTimeZone(input.latitude, input.longitude) : null;
  if (zone) {
    const { utcMs, utcOffsetMinutes } = localWallTimeToUtc(input.date, input.hour, minute, zone);
    return { utc: new Date(utcMs), timeZone: zone, utcOffsetMinutes, basis: "iana" };
  }
  // Longitude fallback, unchanged from the old Vedic conversion, so a
  // chart without resolvable coordinates reproduces the old result.
  const { y, m, d } = parseDateStrict(input.date);
  const offsetMinutes = (input.longitude / 15) * 60;
  const utcMs = Date.UTC(y, m - 1, d, input.hour, minute) - offsetMinutes * 60000;
  return { utc: new Date(utcMs), timeZone: null, utcOffsetMinutes: offsetMinutes, basis: "longitude" };
}

/** Local apparent solar wall time for a UTC instant at a longitude:
    UTC plus longitude / 15 hours, rounded to the nearest minute like
    the old applyLongitudeCorrection. correctionMinutes is the shift
    against the civil wall time given, in minutes, rounded to 0.1. */
export function solarWallTime(
  utc: Date,
  longitude: number,
  civilWallMs: number,
): { date: string; hour: number; minute: number; correctionMinutes: number } {
  const solarMs = utc.getTime() + (longitude / 15) * 3600 * 1000;
  const solar = new Date(solarMs);
  const totalMinutes = solar.getUTCHours() * 60 + solar.getUTCMinutes() + solar.getUTCSeconds() / 60;
  const rounded = Math.round(totalMinutes);
  const hour = Math.floor(rounded / 60) % 24;
  const minute = rounded % 60;
  // The date can roll over when rounding pushes past midnight; read
  // it from the rounded instant rather than the raw solar instant.
  const roundedMs = Date.UTC(solar.getUTCFullYear(), solar.getUTCMonth(), solar.getUTCDate()) + rounded * 60000;
  const roundedDate = new Date(roundedMs);
  return {
    date: roundedDate.toISOString().slice(0, 10),
    hour,
    minute,
    correctionMinutes: Math.round(((solarMs - civilWallMs) / 60000) * 10) / 10,
  };
}

/** "UTC−04:00", "UTC+05:45", "UTC+00:00". Minus is U+2212, matching
    the site's typographic style. */
export function formatUtcOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "−" : "+";
  const abs = Math.round(Math.abs(offsetMinutes));
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${hh}:${mm}`;
}
