import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

// Sortes Phase 2 batch 1 (Velu, 2026-11-14): the Astryx scoped
// pilot — pricing page UI only. No billing, no checkout wiring, no
// ledger changes: subscription variants do not exist yet, so the
// tier buttons are disabled placeholders and the page links to
// /oracles for the packs that exist today. Copy is asserted on the
// actual data and JSX elements, not the whole file: the comments
// above the TIERS array quote the numbers, so a whole-file
// toContain would pass even if the rendered values were reverted
// (remodel wiring lesson).
//
// Deliberately NOT on this page: GradientText / ShinyText (the
// shadcn CLI vendored them cleanly, but both fail the repo lint
// out of the box with react-hooks/refs errors, the same failure
// Batch 2 proved for MagicBento, and generated files are never
// hand-edited), TiltedCard (never on a money page), MagicBento.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

const client = () => src("src/components/PricingClient.tsx");
const page = () => src("src/app/pricing/page.tsx");

function tierBlock(source: string, id: "spark" | "star" | "moon") {
  const m = source.match(
    new RegExp(`id: "${id}",\\n([\\s\\S]*?)\\n  \\},`)
  );
  expect(m).not.toBeNull();
  return (m as RegExpMatchArray)[1];
}

function featuresOf(source: string, id: "spark" | "star" | "moon") {
  const block = tierBlock(source, id);
  const m = block.match(/features: \[([\s\S]*?)\]/);
  expect(m).not.toBeNull();
  return [...(m as RegExpMatchArray)[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

describe("Pricing tiers: Velu's exact numbers", () => {
  it("has Spark / Star / Moon with exact monthly, annual, credits, savings", () => {
    const c = client();
    const spark = tierBlock(c, "spark");
    expect(spark).toContain('name: "Spark",');
    expect(spark).toContain("monthly: 7.99,");
    expect(spark).toContain("annual: 79.88,");
    expect(spark).toContain("credits: 1000,");
    expect(spark).toContain("savings: 16,");
    expect(spark).toContain("popular: false,");
    const star = tierBlock(c, "star");
    expect(star).toContain('name: "Star",');
    expect(star).toContain("monthly: 14.99,");
    expect(star).toContain("annual: 149.88,");
    expect(star).toContain("credits: 2500,");
    expect(star).toContain("savings: 30,");
    expect(star).toContain("popular: true,");
    const moon = tierBlock(c, "moon");
    expect(moon).toContain('name: "Moon",');
    expect(moon).toContain("monthly: 29.99,");
    expect(moon).toContain("annual: 299.88,");
    expect(moon).toContain("credits: 6000,");
    expect(moon).toContain("savings: 60,");
    expect(moon).toContain("popular: false,");
    // Exactly three tiers, and only Star is popular.
    expect([...c.matchAll(/id: "(?:spark|star|moon)",/g)].length).toBe(3);
    expect([...c.matchAll(/popular: true,/g)].length).toBe(1);
    // The savings are the plan arithmetic, not invented discounts.
    expect(7.99 * 12 - 79.88).toBeCloseTo(16, 2);
    expect(14.99 * 12 - 149.88).toBeCloseTo(30, 2);
    expect(29.99 * 12 - 299.88).toBeCloseTo(60, 2);
  });

  it("renders the price from the tier data, monthly and annual", () => {
    const c = client();
    expect(c).toContain(
      'const price = billing === "monthly" ? tier.monthly : tier.annual;'
    );
    const price = c.match(
      /<p className="mt-3 font-display text-\[40px\][^>]*>([\s\S]*?)<\/p>/
    );
    expect(price).not.toBeNull();
    expect((price as RegExpMatchArray)[1]).toContain("${price.toFixed(2)}");
    expect(c).toContain('{billing === "monthly" ? "per month" : "per year"}');
    const credits = c.match(
      /<p className="mt-2 text-base text-cream[^>]*>([\s\S]*?)<\/p>/
    );
    expect(credits).not.toBeNull();
    expect((credits as RegExpMatchArray)[1]).toContain(
      "{tier.credits.toLocaleString()}"
    );
    expect((credits as RegExpMatchArray)[1]).toContain("credits a month");
  });
});

describe("Pricing feature lists: only what exists in code (4/3/3)", () => {
  it("Spark lists 4 lines: reading costs, follow-ups, daily card", () => {
    expect(featuresOf(client(), "spark")).toEqual([
      "1-card readings — 100 credits each",
      "3-card readings — 200 credits each",
      "Follow-up questions — 50 credits each",
      "Daily card free, every day",
    ]);
  });

  it("Star lists 3 lines as a delta on Spark", () => {
    expect(featuresOf(client(), "star")).toEqual([
      "Everything in Spark, plus 1,500 more credits a month",
      "Chart readings — 300 credits each",
      "Your journal and reading history",
    ]);
  });

  it("Moon lists 3 lines as a delta on Star", () => {
    expect(featuresOf(client(), "moon")).toEqual([
      "Everything in Star, plus 3,500 more credits a month",
      "Reports: transit, year-ahead, and relationship",
      "60 one-card readings a month",
    ]);
  });

  it("never lists rollover or a monthly deep reading — neither is built", () => {
    // Assert on the rendered feature lists, not the whole file:
    // the header comment above TIERS names rollover and deep
    // reading to explain why they are excluded, so a whole-file
    // toContain would fail on the documentation itself.
    const c = client();
    for (const id of ["spark", "star", "moon"] as const) {
      const joined = featuresOf(c, id).join(" ");
      expect(joined).not.toContain("rollover");
      expect(joined).not.toContain("Rollover");
      expect(joined).not.toContain("deep reading");
      expect(joined).not.toContain("Deep reading");
    }
  });
});

describe("Pricing video formula: one badge, one lifted tier, one primary button", () => {
  it("has exactly one Most popular badge, on Star only", () => {
    const c = client();
    expect([...c.matchAll(/<Badge/g)].length).toBe(3);
    const badges = [...c.matchAll(/<Badge[^>]*\/>/g)].map((m) => m[0]);
    expect(badges).toHaveLength(3);
    expect(badges.filter((b) => b.includes('label="Most popular"'))).toHaveLength(1);
    // Two "Coming soon" badges: one by the h1 (subscriptions are
    // not open yet) and one on the top-ups section (no variants
    // exist yet). Both are pinned, so a third badge cannot sneak in.
    expect(badges.filter((b) => b.includes('label="Coming soon"'))).toHaveLength(2);
    expect(c).toContain("{tier.popular && <Badge");
    expect([...c.matchAll(/popular: true,/g)].length).toBe(1);
  });

  it("lifts only the Star tier, with the StarBorder gold border", () => {
    const c = client();
    // The lift starts at 960px, where the grid reaches three
    // columns — at sm (640px) the grid is two columns and a lifted
    // Star would float alone in row 1 (Sonnet nit, PR #86).
    expect([...c.matchAll(/min-\[960px\]:-translate-y-4/g)].length).toBe(1);
    expect(c).not.toContain("sm:-translate-y-4");
    expect(c).toContain(
      'tier.id === "star"\n                  ? "min-[960px]:-translate-y-4 shadow-[0_24px_48px_-24px_rgba(212,175,55,0.55)]"'
    );
    expect([...c.matchAll(/<StarBorder/g)].length).toBe(1);
    expect(c).toContain('{tier.id === "star" ? (');
    expect(c).toContain("<StarBorder");
    expect(c).toContain('radius="1.5rem"');
  });

  it("has one primary button (Star) and outlined secondary on Spark/Moon", () => {
    const c = client();
    expect([...c.matchAll(/<Button/g)].length).toBe(1);
    const button = c.match(/<Button[\s\S]*?\/>/);
    expect(button).not.toBeNull();
    expect((button as RegExpMatchArray)[0]).toContain(
      'variant={tier.id === "star" ? "primary" : "secondary"}'
    );
    expect((button as RegExpMatchArray)[0]).toContain("isDisabled");
    expect((button as RegExpMatchArray)[0]).toContain("label={`Choose ${tier.name}`}");
  });
});

describe("Pricing toggle, savings, top-ups, credit costs", () => {
  it("toggles monthly/annual with dollar savings on the toggle and per card", () => {
    const c = client();
    expect(c).toContain('aria-pressed={billing === "monthly"}');
    expect(c).toContain('aria-pressed={billing === "annual"}');
    expect(c).toContain(
      "Annual billing: save $16 on Spark, $30 on Star, $60 on Moon."
    );
    const savings = c.match(
      /<p className="mt-1 text-sm font-semibold text-goldbright[^>]*>([\s\S]*?)<\/p>/
    );
    expect(savings).not.toBeNull();
    expect((savings as RegExpMatchArray)[1]).toContain(
      "Save $<CountUp value={tier.savings} /> a year"
    );
    expect(c).toContain('{billing === "annual" && (');
  });

  it("shows both top-ups with exact prices, never expiring, marked coming soon", () => {
    const c = client();
    const topups = c.match(/const TOPUPS = \[([\s\S]*?)\];/);
    expect(topups).not.toBeNull();
    expect((topups as RegExpMatchArray)[1]).toContain("{ credits: 1000, price: 9.99 }");
    expect((topups as RegExpMatchArray)[1]).toContain("{ credits: 3000, price: 24.99 }");
    expect(c).toContain("Never expires");
    expect(c).toContain("Top up any time");
    // Codex P2 (PR #86): top-ups have no purchase action yet, so
    // the page must not present them as buyable now.
    expect(c).toContain('label="Coming soon"');
    expect(c).toContain("Top-ups launch with subscriptions");
    expect(c).not.toContain("anyone can buy them");
  });

  it("shows the credit costs: 1-card 100, 3-card 200, chart 300, follow-up 50", () => {
    const c = client();
    const costs = c.match(/const CREDIT_COSTS = \[([\s\S]*?)\];/);
    expect(costs).not.toBeNull();
    expect((costs as RegExpMatchArray)[1]).toContain(
      '{ label: "1-card reading", credits: 100 }'
    );
    expect((costs as RegExpMatchArray)[1]).toContain(
      '{ label: "3-card reading", credits: 200 }'
    );
    expect((costs as RegExpMatchArray)[1]).toContain(
      '{ label: "Chart reading", credits: 300 }'
    );
    expect((costs as RegExpMatchArray)[1]).toContain(
      '{ label: "Follow-up question", credits: 50 }'
    );
    expect(c).toContain("What a reading costs");
    // CodeRabbit Minor (PR #86): the 100/200/300/50 schedule is
    // planned, not live — readings cost 1 Oracle each today.
    expect(c).toContain("Planned costs for subscriptions");
    expect(c).toContain("readings cost 1 Oracle each");
  });
});

describe("Pricing honesty: disabled CTAs, packs link, no checkout wiring", () => {
  it("renders disabled tier buttons and the subscriptions-open-soon line to /oracles", () => {
    const c = client();
    const button = c.match(/<Button[\s\S]*?\/>/);
    expect(button).not.toBeNull();
    expect((button as RegExpMatchArray)[0]).toContain("isDisabled");
    expect(c).toContain("Subscriptions open soon — Oracle packs available now.");
    const link = c.match(
      /<Link href="\/oracles"[^>]*>([\s\S]*?)<\/Link>/
    );
    expect(link).not.toBeNull();
    expect((link as RegExpMatchArray)[1]).toContain("See Oracle packs");
  });

  it("wires nothing to checkout: no Lemon Squeezy, no checkout route, no invented route", () => {
    const c = client();
    const p = page();
    expect(c).not.toContain("lemonsqueezy");
    expect(c).not.toContain("/api/checkout");
    expect(c).not.toContain("window.location");
    expect(p).not.toContain("lemonsqueezy");
    expect(p).not.toContain("/api/checkout");
    expect(c).not.toContain("/pricing/checkout");
    expect(c).not.toContain("/subscribe");
  });

  it("leaves /oracles untouched: the packs are still there", () => {
    const oracles = src("src/app/oracles/page.tsx");
    expect(oracles).toContain("Oracle packs");
    expect(oracles).toContain("CREDIT_PACKS.map");
    expect(oracles).toContain("PackBuyButton");
    expect(oracles).toContain("Most popular");
    expect(existsSync(path.resolve(process.cwd(), "src/app/oracles/PackBuyButton.tsx"))).toBe(true);
  });

  it("is not redirected away: the legacy /pricing → /oracles redirect is gone", () => {
    // next.config.ts had a permanent (308) /pricing → /oracles
    // redirect from the audit era; Next redirects outrank the
    // route, so the page 308d to /oracles until it was removed.
    const config = src("next.config.ts");
    expect(config).not.toContain('{ source: "/pricing"');
    expect(config).not.toContain('"/pricing", destination: "/oracles"');
  });
});

describe("Pricing card contrast: dark islands on the light page", () => {
  it("scopes the dark token stops to the card content in globals.css", () => {
    // Contrast fix (2026-11-14): the Astryx Cards are navy while
    // the page is light, and <Theme mode="dark"> does not touch the
    // site's Tailwind --color-* tokens, so text-cream resolved to
    // dark ink #1c1a15 on navy (1.06:1 — invisible) and the gold
    // price to #7c5e00 (2.70:1, below the 3:1 large-text bar).
    const css = src("src/app/globals.css");
    const scope = css.match(/\.pricing-card-dark \{([\s\S]*?)\}/);
    expect(scope).not.toBeNull();
    const body = (scope as RegExpMatchArray)[1];
    // Codex P1 (PR #88): the values reference the Astryx theme
    // tokens — the sortes theme is the single source for the
    // pricing page's dark palette, so there is no second copy of
    // the palette to drift. The hex after each var() is only the
    // fallback if the theme variable is ever out of scope.
    expect(body).toContain("--color-cream: var(--color-text-primary, #ede6d6);");
    expect(body).toContain("--color-goldbright: var(--color-text-accent, #f4d03f);");
    expect(body).toContain("--color-gold: var(--color-accent, #d4af37);");
    expect(body).toContain("--color-panel: var(--color-background-card, #1a1f2e);");
    // No bare hex as the primary value: a duplicate palette.
    expect(body).not.toContain("--color-cream: #ede6d6;");
    expect(body).not.toContain("--color-goldbright: #f4d03f;");
    // The scope must NOT flip the page background itself: the
    // pricing page background stays the light paper.
    expect(body).not.toContain("#fdf9ee");
  });

  it("applies the dark scope inside the tier Cards and the top-up Cards, nowhere else", () => {
    const c = client();
    // One occurrence in the tier map, one in the top-up map.
    expect([...c.matchAll(/pricing-card-dark/g)].length).toBe(2);
    // The {0} in gap={0} must be escaped: unescaped, {0} is a
    // regex quantifier (zero of the preceding token), so the
    // literal "gap=" would never match.
    const tierStack = c.match(
      /<VStack gap=\{0\} className="pricing-card-dark h-full text-center">([\s\S]*?)<\/VStack>/
    );
    expect(tierStack).not.toBeNull();
    expect((tierStack as RegExpMatchArray)[1]).toContain("{tier.name}");
    expect((tierStack as RegExpMatchArray)[1]).toContain("${price.toFixed(2)}");
    const topupStack = c.match(
      /<VStack gap=\{0\} className="pricing-card-dark text-center">([\s\S]*?)<\/VStack>/
    );
    expect(topupStack).not.toBeNull();
    expect((topupStack as RegExpMatchArray)[1]).toContain("${topup.price.toFixed(2)}");
    // The page-level hero VStack (Pricing eyebrow, h1, intro) and
    // the credit-costs list sit on the light paper and must NOT
    // carry the dark scope.
    expect(c).toContain('<VStack gap={0} className="text-center">');
    expect(c).not.toContain('className="pricing-card-dark text-center">\n        <p className="text-xs uppercase');
  });

  it("keeps the card text on the existing Tailwind classes (no new colours invented)", () => {
    // The fix is a token-scope change only: the card text still
    // uses text-cream / text-cream/75 / text-cream/85 /
    // text-goldbright, which now resolve to the dark stops inside
    // the scope. No hex, no arbitrary var() colour, no new class.
    const c = client();
    expect(c).toContain('className="font-display text-xl text-cream"');
    expect(c).toContain('className="mt-3 font-display text-[40px] font-bold leading-none text-goldbright');
    expect(c).toContain('className="mt-4 space-y-2 text-left text-sm text-cream/85"');
    expect(c).not.toContain("text-[var(--color-text-primary)]");
    expect(c).not.toContain("text-[var(--color-text-accent)]");
  });
});

describe("Pricing page: Astryx pilot wiring", () => {
  it("wraps the page in the built Sortes theme, dark mode, pricing route only", () => {
    const p = page();
    expect(p).toContain('import { sortesTheme } from "@/themes/sortes/sortes.js";');
    expect(p).toContain('import { Theme } from "@astryxdesign/core/theme";');
    expect(p).toContain('<Theme theme={sortesTheme} mode="dark">');
    expect(p).toContain("<PricingClient />");
    expect(p).toContain('title: "Pricing"');
    expect(p).toContain('canonical: "/pricing"');
    // Sonnet nit (PR #86): the meta/OG descriptions are search
    // snippets, so they must not promise subscriptions as live.
    expect(p).toContain("Sortes subscriptions, coming soon:");
  });

  it("renders tiers with Astryx Card / Badge / Button, StarBorder, CountUp", () => {
    const c = client();
    expect(c).toContain('import { Card } from "@astryxdesign/core/Card";');
    expect(c).toContain('import { Badge } from "@astryxdesign/core/Badge";');
    expect(c).toContain('import { Button } from "@astryxdesign/core/Button";');
    expect(c).toContain('import { StarBorder } from "@/components/ReactBits";');
    expect(c).toContain('import CountUp from "@/components/CountUp";');
    expect(c).toContain("<Card");
    expect(existsSync(path.resolve(process.cwd(), "src/themes/sortes/sortesTheme.ts"))).toBe(true);
    expect(existsSync(path.resolve(process.cwd(), "src/themes/sortes/sortes.css"))).toBe(true);
    expect(existsSync(path.resolve(process.cwd(), "src/astryx-themes.ts"))).toBe(true);
  });

  it("lays the page out with Astryx Section / Stack / Grid, not raw divs (Codex P1, PR #86)", () => {
    const c = client();
    expect(c).toContain('import { Section } from "@astryxdesign/core/Section";');
    expect(c).toContain('import { VStack } from "@astryxdesign/core/VStack";');
    expect(c).toContain('import { HStack } from "@astryxdesign/core/HStack";');
    expect(c).toContain('import { Grid } from "@astryxdesign/core/Grid";');
    expect(c).toContain("<Section");
    expect(c).toContain("<VStack");
    expect(c).toContain("<HStack");
    expect(c).toContain("<Grid");
    // The only raw <div> left is the mt-auto spacer inside each
    // Card that pushes the button to the bottom — Astryx has no
    // Spacer component. Count JSX divs only: the file's comments
    // mention <div> twice, so match the className form.
    expect([...c.matchAll(/<div className="/g)].length).toBe(1);
    expect(c).toContain('<div className="mt-auto pt-6">');
  });

  it("uses no dropped or forbidden bits on this page", () => {
    const c = client();
    expect(c).not.toContain("GradientText");
    expect(c).not.toContain("ShinyText");
    expect(c).not.toContain("TiltedCard");
    expect(c).not.toContain("MagicBento");
    expect(c).not.toContain("SpotlightCard");
    expect(
      existsSync(path.resolve(process.cwd(), "src/components/GradientText.tsx"))
    ).toBe(false);
    expect(
      existsSync(path.resolve(process.cwd(), "src/components/ShinyText.tsx"))
    ).toBe(false);
  });
});
