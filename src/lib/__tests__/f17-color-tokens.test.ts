import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// UX audit Phase 2, F17 (2026-11-16): every colour literal lives in
// the @theme token set (globals.css) or in the single JS source of
// truth (src/lib/brand.ts, BRAND). CSS uses token utilities
// (shadow-*, text-*, bg-*); component props that set CSS variables
// take var(--color-*) strings; props that must be real hex (a JS
// parser, html-to-image, metadata) take BRAND values.
//
// Deliberately out of scope, recorded here so a later sweep does not
// re-open them: the bespoke highlightColor tint (#f3ead3 / #3a3120,
// no token matches it, same as PR #117); the SVG chart palettes
// (CustomWesternWheel, ZiweiChartBoard) with bespoke tints; the
// particle glow colours (CardBurst pale gold, HoldButton GLOW white);
// the FoldText black/white fold shading; the Astryx theme file
// (sortesTheme.ts) itself, which IS the token set.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("F17: no colour literals outside the token set", () => {
  it("the shadow tokens exist in @theme", () => {
    const css = src("src/app/globals.css");
    for (const t of [
      "--shadow-card:",
      "--shadow-card-lg:",
      "--shadow-gold:",
      "--shadow-gold-lg:",
      "--shadow-gold-sm:",
      "--shadow-gold-ring:",
      "--shadow-card-md:",
      "--shadow-card-sm:",
      "--shadow-inset-hi:",
      "--shadow-spiral:",
      "--shadow-card-xl:",
      "--shadow-card-gold:",
      "--shadow-toast:",
    ]) {
      expect(css).toContain(t);
    }
  });

  it("no arbitrary rgba shadow survives in a class string", () => {
    const files = [
      "src/app/deck/[slug]/page.tsx",
      "src/app/deck/DeckClient.tsx",
      "src/app/spreads/SpreadsClient.tsx",
      "src/components/SpecularButton.tsx",
      "src/components/HeroFanStatic.tsx",
      "src/components/HoldButton.tsx",
      "src/components/InfiniteSpiral.tsx",
      "src/components/ReturningHome.tsx",
      "src/components/SpreadDiagram.tsx",
      "src/components/SonnerToaster.tsx",
      "src/components/TarotCard.tsx",
      "src/components/ThemedDatePicker.tsx",
      "src/components/PricingClient.tsx",
      "src/app/page.tsx",
    ];
    for (const f of files) {
      const c = src(f);
      expect(c).not.toMatch(/shadow-\[[^\]]*rgba?\(/);
    }
  });

  it("inline styles use BRAND, not hardcoded hex", () => {
    for (const f of [
      "src/app/charts/ChartSections.tsx",
      "src/components/ShareReading.tsx",
    ]) {
      const c = src(f);
      expect(c).not.toMatch(/style=\{\{[^}]*"#[0-9a-fA-F]{3,6}"/);
    }
    expect(src("src/components/SpreadDiagram.tsx")).not.toContain("const GOLD");
  });

  it("component colour props use tokens or BRAND", () => {
    // GlideSelect (charts, both instances): token-backed, highlight stays bespoke.
    const charts = src("src/app/charts/ChartSections.tsx");
    expect(charts).toContain('accentColor="var(--color-gold)"');
    expect(charts).toContain('surfaceColor="var(--color-panel)"');
    expect(charts).toContain('textColor="var(--color-cream)"');
    // HoldCard (daily, Velu 2026-11-16): token classes for the bar,
    // so the theme flips without JS tracking. The track is the
    // Tailwind token class bg-gold/20 on the <progress> element;
    // the fill is the gold token in globals.css
    // (.daily-progress pseudo-elements), never a hardcoded hex.
    const daily = src("src/app/daily/page.tsx");
    const holdCard = src("src/components/HoldCard.tsx");
    expect(holdCard).toContain("bg-gold/20");
    expect(holdCard).not.toContain("#d4af37");
    expect(holdCard).not.toContain("#f4d03f");
    const css = src("src/app/globals.css");
    expect(css).toContain(".daily-progress::-webkit-progress-value");
    expect(css).toContain(".daily-progress::-moz-progress-bar");
    expect(daily).not.toContain("siteTheme");
    // Sonner toaster (replaced SwipeToast, 2026-11-17): tokens.
    const toaster = src("src/components/SonnerToaster.tsx");
    expect(toaster).toContain('"--normal-bg": "var(--color-panel)"');
    expect(toaster).toContain('"--normal-text": "var(--color-cream)"');
    expect(toaster).toContain('background: "var(--color-gold)"');
    // SlideCommit parses hex, so it takes BRAND.
    const intake = src("src/app/intake/[slug]/IntakeSteps.tsx");
    expect(intake).toContain("trackColor={BRAND.panel}");
    expect(intake).toContain("handleColor={BRAND.gold}");
    expect(intake).toContain("dangerColor={BRAND.danger}");
    // Metadata and theme colour: BRAND.
    expect(src("src/app/layout.tsx")).toContain("themeColor: BRAND.navyDeep");
    expect(src("src/app/manifest.ts")).toContain("theme_color: BRAND.navyDeep");
    expect(src("src/components/Header.tsx")).toContain("dark: BRAND.navyDeep, light: BRAND.cream");
    // Three.js materials and the holo foil: tokens.
    expect(src("src/components/HoloCard.tsx")).toContain('foilColor = "var(--color-gold)"');
  });
});
