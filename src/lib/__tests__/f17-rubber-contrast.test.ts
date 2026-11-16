/**
 * UX audit Phase 2, F17 follow-up (found by the Lighthouse after-run).
 * The RubberSegment active label used a fixed dark-navy
 * activeTextColor (BRAND.navyDeep) on a thumb that flips with the
 * theme (var(--color-gold): bright gold in dark, dark gold in
 * light). In light theme that was dark navy on dark gold, 3.01:1,
 * failing WCAG AA, so Lighthouse a11y dropped to 96 on horoscope
 * and 97 on reports. The active text is a theme token now:
 * var(--color-ink) is near-black in dark theme and cream in light
 * theme, so the active label passes AA on the thumb in both.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("RubberSegment active text flips with the theme", () => {
  it("defaults activeTextColor to var(--color-ink), never a fixed hex", () => {
    const c = src("src/components/RubberSegment.tsx");
    expect(c).toContain("activeTextColor = 'var(--color-ink)'");
    expect(c).not.toContain("activeTextColor = '#0f1424'");
  });

  it("both call sites pass var(--color-ink), not BRAND.navyDeep", () => {
    for (const rel of [
      "src/app/horoscope/HoroscopeClient.tsx",
      "src/app/reports/ReportsClient.tsx",
    ]) {
      const c = src(rel);
      expect(c).toContain('activeTextColor="var(--color-ink)"');
      expect(c).not.toContain("activeTextColor={BRAND.navyDeep}");
      expect(c).not.toContain("BRAND");
    }
  });
});
