import { describe, it, expect } from "vitest";
import {
  patternMirror,
  buildJournalMarkdown,
  type CardResolver,
} from "@/lib/journal";
import type { Reading } from "@/lib/types";

function reading(
  id: string,
  createdAt: string,
  cardIds: string[],
  extra: Partial<Reading> = {}
): Reading {
  return {
    id,
    createdAt,
    spreadSlug: "quick-insight",
    spreadName: "Quick Insight",
    cards: cardIds.map((cardId, i) => ({
      cardId,
      reversed: false,
      position: `Position ${i + 1}`,
      positionKey: `p${i + 1}`,
    })),
    interpretation: "A test interpretation, first sentence. Second sentence here.",
    aiGenerated: true,
    question: `Question ${id}?`,
    free: false,
    ...extra,
  };
}

// Stub deck: only what the tests need. Real UI passes getCard.
const RESOLVER: CardResolver = (cardId) => {
  const table: Record<string, { arcana: "major" | "minor"; suit: string | null }> = {
    "major-00": { arcana: "major", suit: null },
    "major-01": { arcana: "major", suit: null },
    "minor-wands-01": { arcana: "minor", suit: "wands" },
    "minor-wands-02": { arcana: "minor", suit: "wands" },
    "minor-cups-01": { arcana: "minor", suit: "cups" },
    "minor-swords-01": { arcana: "minor", suit: "swords" },
    "minor-pentacles-01": { arcana: "minor", suit: "pentacles" },
  };
  return table[cardId] ?? null;
};

const NOW = Date.parse("2026-11-06T12:00:00.000Z");
const daysAgo = (n: number) =>
  new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

describe("patternMirror", () => {
  it("returns empty counts for an empty journal", () => {
    const m = patternMirror([], RESOLVER, NOW);
    expect(m.totalReadings).toBe(0);
    expect(m.totalDraws).toBe(0);
    expect(m.mostDrawn).toEqual([]);
    expect(m.stalkers).toEqual([]);
    expect(m.majors).toBe(0);
    expect(m.minors).toBe(0);
    expect(m.revisitCandidate).toBeNull();
  });

  it("counts most-drawn cards and flags stalkers at 3+ draws", () => {
    const readings = [
      reading("r1", daysAgo(1), ["major-00", "minor-wands-01"]),
      reading("r2", daysAgo(2), ["major-00", "minor-cups-01"]),
      reading("r3", daysAgo(3), ["major-00", "minor-wands-02"]),
    ];
    const m = patternMirror(readings, RESOLVER, NOW);
    expect(m.totalReadings).toBe(3);
    expect(m.totalDraws).toBe(6);
    expect(m.mostDrawn[0]).toEqual({ cardId: "major-00", count: 3 });
    // A card drawn twice is most-drawn material, not a stalker.
    expect(m.stalkers).toEqual([{ cardId: "major-00", count: 3 }]);
    expect(m.mostDrawn.map((c) => c.cardId)).toContain("minor-wands-01");
  });

  it("balances suits and majors vs minors from the resolver only", () => {
    const readings = [
      reading("r1", daysAgo(1), ["major-00", "minor-wands-01", "minor-cups-01"]),
      reading("r2", daysAgo(2), ["major-01", "minor-wands-02", "minor-swords-01", "minor-pentacles-01"]),
    ];
    const m = patternMirror(readings, RESOLVER, NOW);
    expect(m.majors).toBe(2);
    expect(m.minors).toBe(5);
    const suits = Object.fromEntries(m.suitBalance.map((s) => [s.suit, s.count]));
    expect(suits).toEqual({ wands: 2, cups: 1, swords: 1, pentacles: 1 });
  });

  it("ignores card ids the resolver cannot resolve", () => {
    const readings = [reading("r1", daysAgo(1), ["major-00", "no-such-card"])];
    const m = patternMirror(readings, RESOLVER, NOW);
    expect(m.totalDraws).toBe(2);
    expect(m.mostDrawn).toEqual([
      { cardId: "major-00", count: 1 },
      { cardId: "no-such-card", count: 1 },
    ]);
    expect(m.majors).toBe(1);
    expect(m.minors).toBe(0);
  });

  it("surfaces the reading from about 7 days ago, and none when there is none", () => {
    const readings = [
      reading("r1", daysAgo(1), ["major-00"]),
      reading("r2", daysAgo(7), ["major-01"]),
      reading("r3", daysAgo(20), ["minor-wands-01"]),
    ];
    const m = patternMirror(readings, RESOLVER, NOW);
    expect(m.revisitCandidate?.id).toBe("r2");
    const m2 = patternMirror([readings[0], readings[2]], RESOLVER, NOW);
    expect(m2.revisitCandidate).toBeNull();
  });

  it("skips a 7-day-old reading that already has a revisit note", () => {
    const readings = [
      reading("r1", daysAgo(7), ["major-00"], { revisitNote: "Noted." }),
      reading("r2", daysAgo(6), ["major-01"]),
    ];
    const m = patternMirror(readings, RESOLVER, NOW);
    expect(m.revisitCandidate?.id).toBe("r2");
  });
});

describe("buildJournalMarkdown", () => {
  it("renders readings with dates, questions, cards and interpretation, and nothing invented", () => {
    const readings = [
      reading("r1", "2026-11-05T10:00:00.000Z", ["major-00", "minor-wands-01"]),
    ];
    const md = buildJournalMarkdown(readings, (id) =>
      id === "major-00" ? "The Fool" : id === "minor-wands-01" ? "Ace of Wands" : id
    );
    expect(md).toContain("# Sortes journal");
    expect(md).toContain("November 5, 2026");
    expect(md).toContain("Question r1?");
    expect(md).toContain("The Fool");
    expect(md).toContain("Ace of Wands");
    expect(md).toContain("A test interpretation");
    expect(md).not.toContain("No patterns yet");
  });

  it("renders an honest empty state for an empty journal", () => {
    const md = buildJournalMarkdown([], (id) => id);
    expect(md).toContain("No readings yet");
  });

  it("includes follow-ups when present", () => {
    const readings = [
      reading("r1", "2026-11-05T10:00:00.000Z", ["major-00"], {
        followUps: [
          { question: "And then?", answer: "A short answer.", createdAt: "2026-11-05T11:00:00.000Z", free: true },
        ],
      }),
    ];
    const md = buildJournalMarkdown(readings, (id) => id);
    expect(md).toContain("And then?");
    expect(md).toContain("A short answer.");
  });

  it("names the serving model for AI readings that carry one, and nothing for older readings", () => {
    const readings = [
      reading("r1", "2026-11-05T10:00:00.000Z", ["major-00"], {
        aiGenerated: true,
        model: "openrouter/free",
      }),
      reading("r2", "2026-11-04T10:00:00.000Z", ["major-01"], { aiGenerated: true }),
    ];
    const md = buildJournalMarkdown(readings, (id) => id);
    expect(md).toContain("Written with openrouter/free.");
    expect(md.match(/Written with/g)?.length).toBe(1);
  });

  it("includes the general note when present", () => {
    const readings = [
      reading("r1", "2026-11-05T10:00:00.000Z", ["major-00"], {
        note: "This landed the day I decided to apply.",
      }),
    ];
    const md = buildJournalMarkdown(readings, (id) => id);
    expect(md).toContain("Note: This landed the day I decided to apply.");
  });
});
