/**
 * UX audit Phase 2, F28 (horoscope), as decided at the push gate.
 * Velu's 2026-11-16 decision restored the spinning wheel: the sign
 * picker is the wheel again (a select under reduced motion), and the
 * audit's 12-button grid is gone. The rest of F28 stands: the
 * duplicate 12-sign link grid below the form stays gone, and the
 * helper line that repeated the button stays cut.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("F28 one sign picker: the wheel is back", () => {
  it("the form picks a sign with the spinning wheel, not a grid", () => {
    const client = src("src/app/horoscope/HoroscopeClient.tsx");
    expect(client).toContain('import OptionWheel from "@/components/OptionWheel"');
    expect(client).toContain("<OptionWheel");
    expect(client).toContain('ariaLabel="Sun sign"');
    expect(client).toContain("items={[...SUN_SIGNS]}");
    expect(client).toContain("defaultSelected={SUN_SIGNS.indexOf(sign)}");
    expect(client).toContain("onChange={(index) => changeSign(SUN_SIGNS[index])}");
    // changeSign is the sign setter (all-pages fix 4): it sets the
    // sign, resets the reveal, and mirrors the sign into ?sign=.
    expect(client).toContain("const changeSign = (next: SunSign) => {");
    expect(client).toContain("setSign(next);");
    expect(client).not.toContain("<fieldset>");
    expect(client).not.toContain("aria-pressed={s === sign}");
    expect(client).not.toContain("Choose your sign from the grid below");
  });

  it("under reduced motion the wheel is a select", () => {
    const client = src("src/app/horoscope/HoroscopeClient.tsx");
    expect(client).toContain("{reducedMotion ? (");
    expect(client).toContain('id="horoscope-sign"');
    expect(client).toContain("<select");
    expect(client).toContain("<option");
  });

  it("the helper line that repeated the button is still gone", () => {
    const client = src("src/app/horoscope/HoroscopeClient.tsx");
    expect(client).not.toContain("Choose your sign and date, then reveal your reflection.");
  });

  it("the duplicate link grid below the form is still gone; deep links still work", () => {
    const page = src("src/app/horoscope/page.tsx");
    expect(page).not.toContain("All twelve signs");
    expect(page).not.toContain("/horoscope?sign=");
    expect(page).toContain("isSunSign");
    expect(page).toContain("searchParams");
  });

  it("the wheel component exists again", () => {
    const wheel = src("src/components/OptionWheel.tsx");
    expect(wheel).toContain("OptionWheel");
  });
});
