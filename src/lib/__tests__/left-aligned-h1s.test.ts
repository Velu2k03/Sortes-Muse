/**
 * Left-aligned h1s (Velu, 2026-11-19): the last four centered page
 * h1s go left, with their directly attached subheads, the same
 * "break the center" pattern as /charts, /account and /journal.
 *
 * Pages: /daily, /horoscope, /oracles, /pricing.
 *
 * Class-only changes on the existing wrappers (Velu's call: no new
 * Astryx VStack in /daily, /horoscope or /oracles; the raw div
 * wrappers stay). Text, colors, fonts, the /daily hero video and
 * the page layout are unchanged.
 *
 * Velu's decisions: the /daily "Practiced N days" chip moves left
 * with the hero block (it is part of the h1 block), and the
 * /horoscope "Daily Horoscope" eyebrow moves left with the h1.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("left-aligned h1s: /daily, /horoscope, /oracles, /pricing", () => {
  it("/daily: hero block starts left, h1 and intro are text-left, chip follows", () => {
    const daily = src("src/app/daily/page.tsx");
    // items-start moves the h1, the intro and the inline-flex
    // "Practiced N days" chip to the left edge together.
    expect(daily).toContain(
      '<div className="relative flex flex-col items-start px-4 py-10 sm:py-12">',
    );
    expect(daily).not.toContain(
      '<div className="relative flex flex-col items-center px-4 py-10 sm:py-12">',
    );
    expect(daily).toContain(
      '<h1 className="mt-3 text-left font-display text-5xl text-goldbright sm:text-6xl">',
    );
    expect(daily).not.toContain(
      '<h1 className="mt-3 text-center font-display text-5xl text-goldbright sm:text-6xl">',
    );
    expect(daily).toContain('<p className="mt-4 max-w-md text-left text-cream/75">');
    expect(daily).not.toContain('<p className="mt-4 max-w-md text-center text-cream/75">');
    // The chip itself is unchanged; it inherits the left start.
    expect(daily).toContain("Practiced {practice.total}");
  });

  it("/horoscope: eyebrow, h1 and intro are left-aligned", () => {
    const horo = src("src/app/horoscope/HoroscopeClient.tsx");
    const header = horo.match(
      /<div className="text-left">\s*<p className="flex items-center gap-2 text-sm text-gold"><Icon name="iconoirSun" size=\{18\} \/>Daily Horoscope<\/p>\s*<h1 className="mt-3 font-display text-5xl text-goldbright sm:text-6xl">Today&apos;s sun-sign reflection<\/h1>\s*<p className="mt-4 max-w-xl text-cream\/75">/,
    );
    expect(header).not.toBeNull();
    // The eyebrow no longer centers its icon row, and the intro
    // no longer sits in a centered box.
    expect(horo).not.toContain(
      '<p className="flex items-center justify-center gap-2 text-sm text-gold">',
    );
    expect(horo).not.toContain('<p className="mx-auto mt-4 max-w-xl text-cream/75">');
  });

  it("/oracles: server-rendered header block is left-aligned", () => {
    const oracles = src("src/app/oracles/page.tsx");
    const header = oracles.match(
      /<div className="text-left">\s*<h1 className="mt-3 font-display text-5xl text-goldbright sm:text-6xl">\s*Top up credits\s*<\/h1>/,
    );
    expect(header).not.toBeNull();
    // The h1 stays in the server page (Lightsite fix V13), not
    // moved into the client component.
    expect(oracles).not.toContain('"use client"');
  });

  it("/pricing: hero VStack is text-left and the intro has no mx-auto", () => {
    const pricing = src("src/components/PricingClient.tsx");
    const hero = pricing.match(
      /<VStack gap=\{0\} className="text-left">([\s\S]*?)<\/VStack>/,
    );
    expect(hero).not.toBeNull();
    const body = (hero as RegExpMatchArray)[1];
    expect(body).toContain(
      '<h1 className="mt-3 font-display text-5xl text-goldbright sm:text-6xl">',
    );
    expect(body).toContain("Choose your plan");
    expect(body).toContain('<p className="mt-4 max-w-xl text-sm text-cream/75">');
    expect(pricing).not.toContain('<VStack gap={0} className="text-center">');
    expect(pricing).not.toContain(
      '<p className="mx-auto mt-4 max-w-xl text-sm text-cream/75">',
    );
  });
});
