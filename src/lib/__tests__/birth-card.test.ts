import { describe, it, expect } from "vitest";
import { birthCardNumbers } from "@/lib/birth-card";

// Phase 3 (3.10): the Personality & Soul pair, pinned against the
// standard reduction worked by hand (digit sums, not invented
// values). Personality is the digit sum reduced to 22 or less
// (22 is The Fool); Soul is the Personality number reduced to a
// single digit. Card names in comments are the Rider-Waite numbers
// in src/data/cards.json (0 Fool, 11 Justice, 8 Strength).
describe("birthCardNumbers", () => {
  it.each([
    ["2000-01-01", { total: 4, personality: 4, soul: 4 }],
    ["1990-05-15", { total: 30, personality: 3, soul: 3 }],
    ["1985-11-22", { total: 29, personality: 11, soul: 2 }],
    ["1978-03-09", { total: 37, personality: 10, soul: 1 }],
    ["1991-01-01", { total: 22, personality: 22, soul: 4 }],
    ["1999-12-31", { total: 35, personality: 8, soul: 8 }],
  ])("%s -> Personality %d, Soul %d", (date, expected) => {
    expect(birthCardNumbers(date)).toEqual(expected);
  });

  it("returns null for anything that is not a YYYY-MM-DD date", () => {
    expect(birthCardNumbers("")).toBeNull();
    expect(birthCardNumbers("not-a-date")).toBeNull();
    expect(birthCardNumbers("1990-5-15")).toBeNull();
  });
});
