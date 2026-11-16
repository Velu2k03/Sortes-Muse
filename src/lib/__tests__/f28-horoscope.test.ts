/**
 * UX audit Phase 2, F28 (horoscope).
 * Two ways to pick a sign (spinning wheel + a 12-sign link grid
 * below) did the same job, and the wheel's blurred next sign read
 * as a broken render in a still. One picker now: a grid of buttons
 * inside the form, the same control for everyone. The wheel is
 * deleted (nothing else used it), and the helper lines are cut.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("F28 one sign picker: the grid", () => {
  it("the form picks a sign from a grid of buttons, not a wheel", () => {
    const client = src("src/app/horoscope/HoroscopeClient.tsx");
    expect(client).toContain("SUN_SIGNS.map((s) =>");
    expect(client).toContain("<fieldset>");
    expect(client).toContain("<legend");
    expect(client).toContain("aria-pressed={s === sign}");
    expect(client).toContain("min-h-11 rounded-full");
    expect(client).not.toContain("OptionWheel");
    expect(client).not.toContain("Choose your sign from the grid below");
  });

  it("the helper line that repeated the button is gone", () => {
    const client = src("src/app/horoscope/HoroscopeClient.tsx");
    expect(client).not.toContain("Choose your sign and date, then reveal your reflection.");
  });

  it("the duplicate link grid below the form is gone; deep links still work", () => {
    const page = src("src/app/horoscope/page.tsx");
    expect(page).not.toContain("All twelve signs");
    expect(page).not.toContain("/horoscope?sign=");
    expect(page).toContain("isSunSign");
    expect(page).toContain("searchParams");
  });

  it("the wheel component is deleted", () => {
    expect(() => src("src/components/OptionWheel.tsx")).toThrow();
  });
});
