import type { WesternResult, ZiweiResult } from "@/lib/charts";
import type { VedicResult } from "@/lib/vedic";
import type { ZiweiLanguage } from "@/lib/ziwei-i18n";
import { localizeStar, zodiacEn } from "@/lib/ziwei-i18n";

/*
 * F10 (2026-11-09): pure chart-form helpers and constants, moved
 * verbatim out of ChartsClient.tsx. No React, no side effects.
 */

export type ChartResult = ZiweiResult | WesternResult | VedicResult;
export type ChartSystem = "ziwei" | "western" | "vedic";

export const FOCUS_AREAS = ["general", "love", "career", "finances", "academics", "health"] as const;

export const PRESETS: { label: string; latitude: number; longitude: number }[] = [
  { label: "Manila, Philippines", latitude: 14.5995, longitude: 120.9842 },
  { label: "Singapore", latitude: 1.3521, longitude: 103.8198 },
  { label: "Kuala Lumpur, Malaysia", latitude: 3.139, longitude: 101.6869 },
  { label: "Jakarta, Indonesia", latitude: -6.2088, longitude: 106.8456 },
  { label: "Bangkok, Thailand", latitude: 13.7563, longitude: 100.5018 },
  { label: "Hong Kong", latitude: 22.3193, longitude: 114.1694 },
  { label: "Tokyo, Japan", latitude: 35.6762, longitude: 139.6503 },
  { label: "London, UK", latitude: 51.5074, longitude: -0.1278 },
  { label: "New York, USA", latitude: 40.7128, longitude: -74.006 },
  { label: "Los Angeles, USA", latitude: 34.0522, longitude: -118.2437 },
  { label: "Sydney, Australia", latitude: -33.8688, longitude: 151.2093 },
];

/** First missing-field message for the birth form, or "" when it is complete. */
export function birthFormError(date: string, system: ChartSystem, gender: string): string {
  if (!date) return "Please choose a birth date.";
  // AF-060: Ziwei places stars by gender, so it needs a choice;
  // Western and Vedic do not use gender at all.
  if (system === "ziwei" && gender === "") {
    return "Please choose a gender for the Ziwei chart, or pick Western or Vedic instead.";
  }
  return "";
}

/** Parse the HH:MM birth time; unknown time gives a null hour. */
export function parseBirthTime(
  unknownTime: boolean,
  time: string
): { hour: number | null; minute: number } | { error: string } {
  if (unknownTime) return { hour: null, minute: 0 };
  // Native time input, but a cleared field submits an empty
  // string, and Number("") is 0, so an empty time would silently
  // become 00:00. Require the HH:MM shape instead.
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return { error: "Please choose a birth time, or tick unknown time." };
  }
  const parts = time.split(":");
  const hour = Number(parts[0]);
  const minute = Number(parts[1] ?? 0);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return { error: "Please choose a valid birth time, or tick unknown time." };
  }
  return { hour, minute };
}

// Ziwei summary must follow the chart language. The old summary used
// raw Chinese values (life name, major stars, zodiac) in every language,
// so an English user still read Chinese in the summary even after
// tapping English, and "Life palace: Life" repeated the palace name.
// English branch uses only the i18n map, no raw Chinese characters.
export function chartSummaryText(r: ChartResult, lang: ZiweiLanguage = "en"): string {
  if (r.system === "ziwei") {
    const life = r.palaces.find((p) => p.isLifePalace);
    const stars = life?.majorStars ?? [];
    if (lang === "zh") {
      return `紫微斗数。命宫：${stars.join("、") || "空宫"}。生肖：${r.zodiac}。`;
    }
    const enStars = stars.map((s) => localizeStar(s).en).join(", ") || "empty";
    return `Ziwei chart. Life: ${enStars}. Zodiac: ${zodiacEn(r.zodiac)}.`;
  }
  if (r.system === "vedic") {
    const rising = r.ascendantSign ? ` Rising: ${r.ascendantSign}.` : ` Birth time unknown: Rising and houses withheld.`;
    return `Vedic chart. Sun: ${r.sunSign}. Moon: ${r.moonSign}, ${r.moonNakshatra} pada ${r.moonNakshatraPada}.${rising}`;
  }
  const angles = r.ascendantSign && r.midheavenSign
    ? ` Rising: ${r.ascendantSign}. Midheaven: ${r.midheavenSign}.`
    : ` Birth time unknown: Rising, Midheaven, and houses withheld.`;
  return `Western chart. Sun: ${r.sunSign}.${angles}`;
}
