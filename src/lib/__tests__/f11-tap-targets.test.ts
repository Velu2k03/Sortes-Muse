import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// UX audit Phase 2, F11 (2026-11-16): every interactive element is
// at least 44px tall (WCAG 2.1 AA target size, 44x44 CSS px). The
// Phase 1 crawl measured these below the bar: header nav menu
// buttons 20px, pricing Monthly/Annual toggle 38px, tier "Not yet
// open" buttons 32px, horoscope steppers 36px. The footer links
// (36px) and the header Sign in link (32px) were the same class of
// problem and are fixed here too. This test pins the minimum on the
// source, so a later edit cannot silently shrink a target again.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("F11: tap targets are at least 44px", () => {
  it("header nav triggers and Journal link are 44px", () => {
    const header = src("src/components/Header.tsx");
    expect(header).toContain("inline-flex min-h-11 items-center px-2 text-sm font-semibold text-goldbright");
    expect(header).toContain("inline-flex min-h-11 items-center px-2 text-sm text-cream/80");
  });

  it("header Sign in link is 44px", () => {
    const header = src("src/components/Header.tsx");
    expect(header).toContain("hidden min-h-11 items-center rounded-full px-4 py-1.5");
  });

  it("pricing Monthly/Annual toggle is 44px", () => {
    const pricing = src("src/components/PricingClient.tsx");
    expect(pricing).toContain("min-h-11 rounded-l-full border px-5 py-2");
    expect(pricing).toContain("min-h-11 rounded-r-full border px-5 py-2");
  });

  it("pricing tier and top-up buttons are 44px", () => {
    const pricing = src("src/components/PricingClient.tsx");
    // The Astryx Button takes className through to the <button>,
    // and min-height wins over its 32px default when larger.
    // Velu 2026-11-17: the tier button now carries mt-6 as well,
    // because the old mt-auto spacer is gone with the equal-height
    // cards; it is still min-h-11, still 44px.
    expect(pricing).toContain('className="mt-6 min-h-11"');
    expect(pricing).toContain('className="mt-4 min-h-11"');
  });

  it("horoscope steppers are 44px", () => {
    const wheel = src("src/components/OptionWheel.tsx");
    expect(wheel).toContain("h-11 w-11 rounded-full");
    expect(wheel).not.toContain("h-9 w-9 rounded-full");
  });

  it("footer links are 44px", () => {
    const footer = src("src/components/Footer.tsx");
    expect(footer).toContain("inline-flex min-h-11 items-center py-2 text-cream/80");
    expect(footer).not.toContain('className="inline-block py-2 text-cream/80');
  });
});
