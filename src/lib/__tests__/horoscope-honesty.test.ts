import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { dailyHoroscope, weeklyHoroscope } from "@/lib/daily";

// Phase G: horoscope honesty. The daily/weekly content is a dated,
// rotating general reflection (daily.ts header), not a personal
// reading and not a prediction. Two things must hold: the content
// must actually change when the underlying date changes (a horoscope
// that never changed would be a static label), and the page must say
// so in plain words.

function days(from: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  for (let i = 0; i < count; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

describe("horoscope honesty: content changes with the date", () => {
  it("daily themes rotate through all seven entries over seven days", () => {
    const themes = new Set(days("2026-11-01", 7).map((d) => dailyHoroscope("Aries", d).theme));
    expect(themes.size).toBe(7);
  });

  it("daily reflection lines rotate through all seven entries over seven days", () => {
    const lines = new Set(days("2026-11-01", 7).map((d) => dailyHoroscope("Aries", d).reflection));
    expect(lines.size).toBe(7);
  });

  it("the same sign on a different date gets different content", () => {
    const a = dailyHoroscope("Leo", "2026-11-05");
    const b = dailyHoroscope("Leo", "2026-11-06");
    expect(a.theme === b.theme && a.reflection === b.reflection).toBe(false);
  });

  it("weekly content changes from one week to the next", () => {
    const themes = new Set(
      ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30", "2026-12-07"].map(
        (d) => weeklyHoroscope("Taurus", d).theme
      )
    );
    expect(themes.size).toBeGreaterThan(1);
    const first = weeklyHoroscope("Taurus", "2026-11-02");
    const second = weeklyHoroscope("Taurus", "2026-11-09");
    expect(first.weekStart).not.toBe(second.weekStart);
  });
});

describe("horoscope honesty: the page labels it as general reflection", () => {
  it("says general reflection, free, unsaved, and not a prediction", () => {
    const src = readFileSync(path.resolve(process.cwd(), "src/app/horoscope/page.tsx"), "utf8").replace(/\s+/g, " ");
    expect(src).toContain("general reflection");
    expect(src).toContain("Free, unsaved");
    expect(src).toContain("Nothing is charged, and nothing is saved");
  });

  it("shows no lucky colour or lucky number gimmick anywhere on the page", () => {
    const src = readFileSync(path.resolve(process.cwd(), "src/app/horoscope/page.tsx"), "utf8");
    expect(src.toLowerCase()).not.toContain("lucky");
    const lib = readFileSync(path.resolve(process.cwd(), "src/lib/daily.ts"), "utf8");
    expect(lib).not.toContain("luckyColour");
    expect(lib).not.toContain("luckyNumber");
  });
});
