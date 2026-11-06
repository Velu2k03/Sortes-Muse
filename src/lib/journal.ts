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

/** Phase 5 (5.1): Pattern Mirror. Everything is computed from the
 *  seeker's own saved readings, never from AI and never paywalled.
 *  Card identity (arcana/suit) comes through `resolveCard`, so this
 *  module still never reads cards.json itself: the UI passes a
 *  getCard-based resolver, tests pass a stub. Unknown ids still count
 *  toward most-drawn/stalker totals (the draw happened) but not
 *  toward suit or arcana balance (nothing is known about them). */

export interface CardRef {
  arcana: "major" | "minor";
  suit: string | null;
}

export type CardResolver = (cardId: string) => CardRef | null;

export interface PatternMirror {
  totalReadings: number;
  totalDraws: number;
  mostDrawn: Array<{ cardId: string; count: number }>;
  suitBalance: Array<{ suit: string; count: number }>;
  majors: number;
  minors: number;
  stalkers: Array<{ cardId: string; count: number }>;
  /** One past reading from about 7 days ago to re-read, if one
   *  exists and has no revisit note yet. */
  revisitCandidate: Reading | null;
}

export const STALKER_MIN_DRAWS = 3;
export const PATTERN_MIRROR_MIN_READINGS = 3;
const SUITS = ["wands", "cups", "swords", "pentacles"] as const;

export function patternMirror(
  readings: Reading[],
  resolveCard: CardResolver,
  now = Date.now()
): PatternMirror {
  const cardCounts = new Map<string, number>();
  const suitCounts = new Map<string, number>(SUITS.map((s) => [s, 0]));
  let majors = 0;
  let minors = 0;
  let totalDraws = 0;
  for (const r of readings) {
    for (const d of r.cards ?? []) {
      totalDraws += 1;
      cardCounts.set(d.cardId, (cardCounts.get(d.cardId) ?? 0) + 1);
      const ref = resolveCard(d.cardId);
      if (!ref) continue;
      if (ref.arcana === "major") majors += 1;
      else minors += 1;
      if (ref.suit && suitCounts.has(ref.suit)) {
        suitCounts.set(ref.suit, (suitCounts.get(ref.suit) ?? 0) + 1);
      }
    }
  }
  const byCountDesc = (a: [string, number], b: [string, number]) =>
    b[1] - a[1] || a[0].localeCompare(b[0]);
  const ranked = [...cardCounts.entries()]
    .sort(byCountDesc)
    .map(([cardId, count]) => ({ cardId, count }));
  // About 7 days ago: 6 to 8 whole days old, no revisit note yet.
  // Closest to exactly 7 days wins; ties go to the newest.
  let revisitCandidate: Reading | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const r of readings) {
    if (r.revisitNote) continue;
    const age = ageInDays(r, now);
    if (age < 6 || age > 8) continue;
    const distance = Math.abs(age - REVISIT_AFTER_DAYS);
    if (
      distance < bestDistance ||
      (distance === bestDistance &&
        revisitCandidate !== null &&
        r.createdAt > revisitCandidate.createdAt)
    ) {
      revisitCandidate = r;
      bestDistance = distance;
    }
  }
  return {
    totalReadings: readings.length,
    totalDraws,
    mostDrawn: ranked.slice(0, 5),
    suitBalance: SUITS.map((suit) => ({ suit, count: suitCounts.get(suit) ?? 0 })),
    majors,
    minors,
    stalkers: ranked.filter((c) => c.count >= STALKER_MIN_DRAWS),
    revisitCandidate,
  };
}

/** Phase 5 (5.4b): Markdown journal export. One .md document of the
 *  journal: readings with dates, questions, cards, interpretations,
 *  and follow-ups. Only the user's own saved content; nothing is
 *  invented. `resolveCardName` maps a card id to its display name
 *  (the UI passes getCard); unknown ids fall back to the id itself. */
export function buildJournalMarkdown(
  readings: Reading[],
  resolveCardName: (cardId: string) => string
): string {
  const lines: string[] = ["# Sortes journal", ""];
  if (readings.length === 0) {
    lines.push("No readings yet. Your journal will appear here once you cast your first reading.");
    return lines.join("\n") + "\n";
  }
  const sorted = [...readings].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const r of sorted) {
    const date = new Date(r.createdAt).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    lines.push(`## ${r.spreadName} — ${date}`, "");
    if (r.question) lines.push(`**Question:** ${r.question}`, "");
    if ((r.cards ?? []).length > 0) {
      lines.push("**Cards:**");
      for (const d of r.cards) {
        const name = resolveCardName(d.cardId);
        lines.push(`- ${d.position}: ${name}${d.reversed ? " (reversed)" : ""}`);
      }
      lines.push("");
    }
    if (r.chartSummary) lines.push(r.chartSummary, "");
    if (r.interpretation) lines.push(r.interpretation, "");
    if (r.aiGenerated && r.model) lines.push(`Written with ${r.model}.`, "");
    if (r.firstImpression) lines.push(`**First impression:** ${r.firstImpression}`, "");
    if (r.nextStep) lines.push(`**Next step:** ${r.nextStep}`, "");
    for (const fu of r.followUps ?? []) {
      lines.push(`**Follow-up:** ${fu.question}`, "", fu.answer, "");
    }
    if (r.revisitNote) lines.push(`**Revisit note:** ${r.revisitNote}`, "");
    lines.push("---", "");
  }
  return lines.join("\n");
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
