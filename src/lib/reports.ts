// M4.1: premium keep-forever reports. Pure computation only: no AI,
// no DB, no network. The route computes natal positions server-side
// from birth inputs, builds the report data (positions and signs
// only), and discards the birth inputs. A saved report contains
// positions, aspects, and the interpretation only, never a birth
// date, time, or coordinates, and nothing birth-related is ever sent
// to an AI prompt. Reports cost 1 credit each, with no free first
// use: they are the premium paid moment, sold per report and never
// rented, so they never expire.
//
// Three report types:
// - transit: Western transits to the natal chart plus Vedic Gochara
//   for one chosen date (reuses the M3.1 and M3.2 engines).
// - year-ahead: twelve monthly Western transit snapshots, the
//   Vimshottari dasha outlook, and the Ziwei annual stack for one
//   calendar year. The Ziwei layer is withheld when birth time is
//   unknown, because calculateZiwei throws on a null hour.
// - comparison: Western cross-aspects between two natal charts.
//   Deliberately NOT a verdict: the prompt forbids compatible or
//   incompatible judgments, scores, and predictions about whether a
//   relationship will last. Both charts are entered by the user, so
//   the comparison is opt-in by construction.
import {
  calculateWestern,
  computeTransits,
  calculateZiweiStacks,
} from "./charts";
import type { TransitResult, ZiweiStacks } from "./charts";
import {
  calculateVedic,
  computeGochara,
  computeDashaTimeline,
} from "./vedic";
import type { GocharaResult, DashaTimeline } from "./vedic";
import { norm360 } from "./angles";

export type ReportType = "transit" | "year-ahead" | "comparison";

export interface BirthInput {
  date: string;
  hour: number | null;
  minute: number;
  latitude: number;
  longitude: number;
  gender: "male" | "female" | null;
}

function isRealDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const check = new Date(Date.UTC(y, mo - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === mo - 1 && check.getUTCDate() === d;
}

function numField(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// Validates one birth input object. Returns null when any field is
// missing or out of range. Gender may be null (it is only required
// for the year-ahead Ziwei layer); the year-ahead builder enforces
// that separately.
export function validateBirthInput(raw: unknown): BirthInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.date !== "string" || !isRealDate(r.date)) return null;
  let hour: number | null = null;
  if (r.hour !== null && r.hour !== undefined) {
    const h = numField(r.hour);
    if (h === null || !Number.isInteger(h) || h < 0 || h > 23) return null;
    hour = h;
  }
  let minute = 0;
  if (r.minute !== null && r.minute !== undefined) {
    const mi = numField(r.minute);
    if (mi === null || !Number.isInteger(mi) || mi < 0 || mi > 59) return null;
    minute = mi;
  }
  const latitude = numField(r.latitude);
  const longitude = numField(r.longitude);
  if (latitude === null || latitude < -90 || latitude > 90) return null;
  if (longitude === null || longitude < -180 || longitude > 180) return null;
  let gender: "male" | "female" | null = null;
  if (r.gender === "male" || r.gender === "female") gender = r.gender;
  else if (r.gender !== null && r.gender !== undefined) return null;
  return { date: r.date, hour, minute, latitude, longitude, gender };
}

export interface TransitReportData {
  kind: "transit";
  targetDate: string;
  unknownTime: boolean;
  sunSign: string;
  moonSign: string;
  transits: TransitResult;
  gochara: GocharaResult;
  notes: string[];
}

export function buildTransitData(birth: BirthInput, targetDate: string): TransitReportData {
  if (!isRealDate(targetDate)) throw new Error("targetDate must be a real YYYY-MM-DD date");
  const western = calculateWestern({
    date: birth.date,
    hour: birth.hour,
    minute: birth.minute,
    latitude: birth.latitude,
    longitude: birth.longitude,
  });
  const transits = computeTransits(
    western.planets.map((p) => ({ name: p.name, longitude: p.longitude })),
    targetDate
  );
  const vedic = calculateVedic({
    date: birth.date,
    hour: birth.hour,
    minute: birth.minute,
    latitude: birth.latitude,
    longitude: birth.longitude,
  });
  const moon = vedic.planets.find((p) => p.name === "moon");
  if (!moon) throw new Error("Vedic calculation returned no Moon");
  const gochara = computeGochara(
    moon.longitude,
    vedic.planets.map((p) => ({ name: p.name, longitude: p.longitude })),
    targetDate
  );
  const notes = [
    "Transit positions use a geocentric noon-UTC reference; same-day Moon aspects are approximate because the Moon moves about 13 degrees a day.",
  ];
  if (birth.hour === null) {
    notes.push("Birth time unknown: planet positions use a noon stand-in, and Rising and houses are withheld.");
  }
  return {
    kind: "transit",
    targetDate,
    unknownTime: birth.hour === null,
    sunSign: western.sunSign,
    moonSign: western.planets.find((p) => p.name === "Moon")?.sign ?? vedic.moonSign,
    transits,
    gochara,
    notes,
  };
}

export interface YearAheadMonth {
  month: string;
  moonSign: string;
  aspects: Array<{
    transitPlanet: string;
    natalPlanet: string;
    aspect: string;
    orb: number;
    state: "applying" | "separating" | "steady";
  }>;
}

export interface YearAheadReportData {
  kind: "year-ahead";
  year: number;
  unknownTime: boolean;
  sunSign: string;
  moonSign: string;
  months: YearAheadMonth[];
  dasha: DashaTimeline;
  ziwei: ZiweiStacks | null;
  ziweiWithheldReason: string | null;
}

export function buildYearAheadData(birth: BirthInput, year: number): YearAheadReportData {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw new Error("year must be an integer between 1900 and 2200");
  }
  const western = calculateWestern({
    date: birth.date,
    hour: birth.hour,
    minute: birth.minute,
    latitude: birth.latitude,
    longitude: birth.longitude,
  });
  const natalPlanets = western.planets.map((p) => ({ name: p.name, longitude: p.longitude }));
  const pad = (n: number) => String(n).padStart(2, "0");
  // One snapshot per month, on the 1st: the month's tightest five
  // aspects only, so the report prompt stays readable instead of
  // carrying twelve full transit tables.
  const months: YearAheadMonth[] = [];
  for (let m = 1; m <= 12; m++) {
    const t = computeTransits(natalPlanets, `${year}-${pad(m)}-01`);
    months.push({
      month: `${year}-${pad(m)}`,
      moonSign: t.moonSign,
      aspects: t.aspects.slice(0, 5),
    });
  }
  const vedic = calculateVedic({
    date: birth.date,
    hour: birth.hour,
    minute: birth.minute,
    latitude: birth.latitude,
    longitude: birth.longitude,
  });
  const moon = vedic.planets.find((p) => p.name === "moon");
  if (!moon) throw new Error("Vedic calculation returned no Moon");
  const dasha = computeDashaTimeline(moon.longitude, birth.date, `${year}-01-01`);
  let ziwei: ZiweiStacks | null = null;
  let ziweiWithheldReason: string | null = null;
  if (birth.hour === null || birth.gender === null) {
    ziweiWithheldReason =
      "The Ziwei annual layer is withheld because it needs a known birth time and gender; the Western monthly themes and the dasha outlook below do not.";
  } else {
    ziwei = calculateZiweiStacks(
      {
        date: birth.date,
        hour: birth.hour,
        minute: birth.minute,
        gender: birth.gender,
        longitude: birth.longitude,
      },
      year
    );
  }
  return {
    kind: "year-ahead",
    year,
    unknownTime: birth.hour === null,
    sunSign: western.sunSign,
    moonSign: western.planets.find((p) => p.name === "Moon")?.sign ?? vedic.moonSign,
    months,
    dasha,
    ziwei,
    ziweiWithheldReason,
  };
}

export interface CrossAspect {
  planetA: string;
  planetB: string;
  aspect: string;
  orb: number;
}

export interface ComparisonReportData {
  kind: "comparison";
  sunSignA: string;
  moonSignA: string;
  sunSignB: string;
  moonSignB: string;
  crossAspects: CrossAspect[];
  unknownTime: boolean;
  notes: string[];
}

// Cross-chart aspects use the same published orbs as the M3.1
// transit engine: conjunction 6, sextile 4, square 5, trine 5,
// opposition 6. Aspect angles are at least 60 degrees apart and
// orbs sum to at most 11, so a pair matches at most one aspect.
const CROSS_ASPECTS = [
  { name: "conjunction", angle: 0, orb: 6 },
  { name: "sextile", angle: 60, orb: 4 },
  { name: "square", angle: 90, orb: 5 },
  { name: "trine", angle: 120, orb: 5 },
  { name: "opposition", angle: 180, orb: 6 },
] as const;

function separation(a: number, b: number): number {
  const diff = Math.abs(norm360(a) - norm360(b));
  return Math.min(diff, 360 - diff);
}

export function buildComparisonData(birthA: BirthInput, birthB: BirthInput): ComparisonReportData {
  const chartA = calculateWestern({
    date: birthA.date,
    hour: birthA.hour,
    minute: birthA.minute,
    latitude: birthA.latitude,
    longitude: birthA.longitude,
  });
  const chartB = calculateWestern({
    date: birthB.date,
    hour: birthB.hour,
    minute: birthB.minute,
    latitude: birthB.latitude,
    longitude: birthB.longitude,
  });
  const crossAspects: CrossAspect[] = [];
  for (const a of chartA.planets) {
    for (const b of chartB.planets) {
      const sep = separation(a.longitude, b.longitude);
      for (const asp of CROSS_ASPECTS) {
        const orb = Math.abs(sep - asp.angle);
        if (orb > asp.orb) continue;
        crossAspects.push({
          planetA: a.name,
          planetB: b.name,
          aspect: asp.name,
          orb: Math.round(orb * 100) / 100,
        });
      }
    }
  }
  crossAspects.sort((x, y) => x.orb - y.orb);
  const moonA = chartA.planets.find((p) => p.name === "Moon")?.sign ?? "";
  const moonB = chartB.planets.find((p) => p.name === "Moon")?.sign ?? "";
  const notes = [
    "Cross-aspects use planet positions only. No verdict is given: this report describes dynamics, never compatibility, and never predicts whether a relationship will last.",
  ];
  if (birthA.hour === null || birthB.hour === null) {
    notes.push("One or both birth times are unknown: planet positions use a noon stand-in, and Rising and houses are withheld.");
  }
  return {
    kind: "comparison",
    sunSignA: chartA.sunSign,
    moonSignA: moonA,
    sunSignB: chartB.sunSign,
    moonSignB: moonB,
    crossAspects,
    unknownTime: birthA.hour === null || birthB.hour === null,
    notes,
  };
}

// Prompt lines: positions and signs only. Birth dates, times,
// coordinates, and place names are never included, because the
// builders above receive positions, not birth data, in their output.
export function transitPromptLines(data: TransitReportData): string {
  const aspectLines = data.transits.aspects
    .map((a) => `- ${a.transitPlanet} ${a.aspect} natal ${a.natalPlanet}, orb ${a.orb} degrees, ${a.state}`)
    .join("\n");
  const gocharaLines = data.gochara.planets
    .map((p) => `- ${p.name}: ${p.sign}, ${p.houseFromMoon} from the natal Moon${p.aspects.length ? `, aspecting natal ${p.aspects.map((x) => x.natalPlanet).join(", ")}` : ""}`)
    .join("\n");
  const pan = data.gochara.panchanga;
  return `Report: transit report for ${data.targetDate}.
Natal Sun: ${data.sunSign}. Natal Moon: ${data.moonSign}. Transit Moon sign on the date: ${data.transits.moonSign}.
Western transits to the natal chart (transit planet, aspect, natal planet, orb, applying or separating):
${aspectLines || "- No transit within orb on this date."}
Vedic Gochara for the same date (transit planet, sign, houses from the natal Moon):
${gocharaLines}
Panchanga for the date: tithi ${pan.tithi}, nakshatra ${pan.nakshatra}, yoga ${pan.yoga}, vara ${pan.vara}, karana ${pan.karana}.
${data.notes.join(" ")}`;
}

export function yearAheadPromptLines(data: YearAheadReportData): string {
  const monthLines = data.months
    .map((m) => {
      const aspects = m.aspects.length
        ? m.aspects.map((a) => `${a.transitPlanet} ${a.aspect} natal ${a.natalPlanet} (orb ${a.orb})`).join("; ")
        : "no transit within orb";
      return `- ${m.month} (transit Moon in ${m.moonSign}): ${aspects}`;
    })
    .join("\n");
  const dashaLines = data.dasha.periods
    .filter((p) => p.end >= `${data.year}-01-01` && p.start <= `${data.year}-12-31`)
    .map((p) => `- ${p.lord}: ${p.start} to ${p.end}`)
    .join("\n");
  const ziweiLines = data.ziwei
    ? `Ziwei decade palace: ${data.ziwei.decade.palaceName} (${data.ziwei.decade.heavenlyStem}${data.ziwei.decade.earthlyBranch}), ages ${data.ziwei.decade.ageRange[0]} to ${data.ziwei.decade.ageRange[1]}, transformations ${data.ziwei.decade.mutagen.join(", ")}. Ziwei annual palace: ${data.ziwei.annual.palaceName} (${data.ziwei.annual.heavenlyStem}${data.ziwei.annual.earthlyBranch}), transformations ${data.ziwei.annual.mutagen.join(", ")}.`
    : data.ziweiWithheldReason ?? "";
  return `Report: year-ahead reading for ${data.year}.
Natal Sun: ${data.sunSign}. Natal Moon: ${data.moonSign}.
Monthly Western transit themes (1st of each month, tightest aspects only):
${monthLines}
Vimshottari mahadasha periods covering ${data.year} (dates YYYY-MM-DD):
${dashaLines || "- No dasha period boundary inside this year."}
${ziweiLines}
Monthly snapshots are 1st-of-month positions, so same-day Moon aspects are approximate.`;
}

export function comparisonPromptLines(data: ComparisonReportData): string {
  const aspectLines = data.crossAspects
    .map((a) => `- Chart A ${a.planetA} ${a.aspect} Chart B ${a.planetB}, orb ${a.orb} degrees`)
    .join("\n");
  return `Report: relationship comparison between two charts.
Chart A Sun: ${data.sunSignA}. Chart A Moon: ${data.moonSignA}.
Chart B Sun: ${data.sunSignB}. Chart B Moon: ${data.moonSignB}.
Cross-aspects (Chart A planet, aspect, Chart B planet, orb, tightest first):
${aspectLines || "- No cross-aspect within orb."}
${data.notes.join(" ")}`;
}

export interface SavedReport {
  id: string;
  type: ReportType;
  title: string;
  targetLabel: string;
  createdAt: string;
  data: TransitReportData | YearAheadReportData | ComparisonReportData;
  interpretation: string;
  // Phase E (item 2): the serving model that wrote the interpretation,
  // as returned by the API. Older reports have none.
  model?: string;
}

export function reportTitle(type: ReportType, targetLabel: string): string {
  if (type === "transit") return `Transit report for ${targetLabel}`;
  if (type === "year-ahead") return `Year-ahead reading for ${targetLabel}`;
  return `Relationship comparison`;
}
