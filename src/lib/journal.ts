import type { Reading } from "@/lib/types";

// M2.2: pure journal helpers. No imports of cards.json or components,
// so these stay trivially testable. Everything here is computed from
// the seeker's own saved readings, never from AI and never paywalled.

export const REVISIT_AFTER_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days since the reading was cast. Unparseable dates are 0. */
export function ageInDays(reading: Reading, now = Date.now()): number {
  const t = Date.parse(reading.createdAt);
  if (Number.isNaN(t)) return 0;
  return Math.floor((now - t) / DAY_MS);
}

/** A reading is ready to revisit once a week has passed and no
 *  revisit note has been saved on it yet. */
export function isRevisitEligible(reading: Reading, now = Date.now()): boolean {
  return !reading.revisitNote && ageInDays(reading, now) >= REVISIT_AFTER_DAYS;
}

export interface DayGroup {
  label: string;
  readings: Reading[];
}

/** Group readings by calendar day, newest day first. Input order is
 *  preserved inside each group, so callers should pass newest-first. */
export function groupReadingsByDay(readings: Reading[]): DayGroup[] {
  const groups: DayGroup[] = [];
  const byLabel = new Map<string, DayGroup>();
  for (const r of readings) {
    const label = new Date(r.createdAt).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    let group = byLabel.get(label);
    if (!group) {
      group = { label, readings: [] };
      byLabel.set(label, group);
      groups.push(group);
    }
    group.readings.push(r);
  }
  return groups;
}

export interface MonthlyReview {
  count: number;
  categories: Array<{ name: string; count: number }>;
  topCards: Array<{ cardId: string; count: number }>;
  stepsCount: number;
  followUpsCount: number;
}

/** Aggregate one calendar month of readings (local year and month).
 *  Categories use the stored category string, falling back to
 *  "uncategorized" for chart readings, which carry no category. */
export function monthlyReview(
  readings: Reading[],
  year: number,
  month: number
): MonthlyReview {
  const inMonth = readings.filter((r) => {
    const d = new Date(r.createdAt);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  const categoryCounts = new Map<string, number>();
  const cardCounts = new Map<string, number>();
  let stepsCount = 0;
  let followUpsCount = 0;
  for (const r of inMonth) {
    const cat = r.category || "uncategorized";
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
    for (const d of r.cards ?? []) {
      cardCounts.set(d.cardId, (cardCounts.get(d.cardId) ?? 0) + 1);
    }
    if (r.nextStep) stepsCount += 1;
    followUpsCount += r.followUps?.length ?? 0;
  }
  const byCountDesc = (a: [string, number], b: [string, number]) =>
    b[1] - a[1] || a[0].localeCompare(b[0]);
  return {
    count: inMonth.length,
    categories: [...categoryCounts.entries()]
      .sort(byCountDesc)
      .map(([name, count]) => ({ name, count })),
    topCards: [...cardCounts.entries()]
      .sort(byCountDesc)
      .slice(0, 3)
      .map(([cardId, count]) => ({ cardId, count })),
    stepsCount,
    followUpsCount,
  };
}
