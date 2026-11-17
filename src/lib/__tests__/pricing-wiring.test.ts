import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

// Sortes Phase 2 batch 1 (Velu, 2026-11-14): the Astryx scoped
// pilot — pricing page UI only. Phase 2 batch 3 wired the
// checkout: the tier buttons call POST /api/checkout/subscription
// (kind "subscription") and the top-up cards call the same route
// (kind "topup"), enabled only when the Lemon Squeezy variants
// are configured (props from the server page). Until then the
// buttons show "Not yet open" (Batch 4.3: no "Coming soon" badge
// — Velu, 2026-11-16) and the Oracle packs block shows what a
// visitor can buy today.
// Copy is asserted on the actual data and JSX elements, not the
// whole file: the comments above the TIERS array quote the
// numbers, so a whole-file toContain would pass even if the
// rendered values were reverted (remodel wiring lesson).
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
    expect(spark).toContain("monthly: 9.99,");
    expect(spark).toContain("annual: 103.88,");
    expect(spark).toContain("credits: 1000,");
    expect(spark).toContain("savings: 16,");
    expect(spark).toContain("popular: false,");
    const star = tierBlock(c, "star");
    expect(star).toContain('name: "Star",');
    expect(star).toContain("monthly: 19.99,");
    expect(star).toContain("annual: 209.88,");
    expect(star).toContain("credits: 2500,");
    expect(star).toContain("savings: 30,");
    expect(star).toContain("popular: true,");
    const moon = tierBlock(c, "moon");
    expect(moon).toContain('name: "Moon",');
    expect(moon).toContain("monthly: 39.99,");
    expect(moon).toContain("annual: 419.88,");
    expect(moon).toContain("credits: 6000,");
    expect(moon).toContain("savings: 60,");
    expect(moon).toContain("popular: false,");
    // Exactly three tiers, and only Star is popular.
    expect([...c.matchAll(/id: "(?:spark|star|moon)",/g)].length).toBe(3);
    expect([...c.matchAll(/popular: true,/g)].length).toBe(1);
    // The savings are the plan arithmetic, not invented discounts.
    expect(9.99 * 12 - 103.88).toBeCloseTo(16, 2);
    expect(19.99 * 12 - 209.88).toBeCloseTo(30, 2);
    expect(39.99 * 12 - 419.88).toBeCloseTo(60, 2);
  });

  it("renders the price from the tier data, monthly and annual", () => {
    const c = client();
    // Star is the focal panel: its price comes from starPrice.
    expect(c).toContain(
      'const starPrice = billing === "monthly" ? star.monthly : star.annual;'
    );
    const starPrice = c.match(
      /<p className="mt-4 font-display text-5xl[^>]*>([\s\S]*?)<\/p>/
    );
    expect(starPrice).not.toBeNull();
    expect((starPrice as RegExpMatchArray)[1]).toContain("${starPrice.toFixed(2)}");
    expect(c).toContain('{billing === "monthly" ? "per month" : "per year"}');
    const starCredits = c.match(
      /<p className="mt-2 text-base text-cream[^>]*>([\s\S]*?)<\/p>/
    );
    expect(starCredits).not.toBeNull();
    expect((starCredits as RegExpMatchArray)[1]).toContain(
      "{star.credits.toLocaleString()}"
    );
    expect((starCredits as RegExpMatchArray)[1]).toContain("Oracles a month");
    // Spark and Moon are quiet rows: their price comes from the
    // per-row price, same monthly/annual rule.
    expect(c).toContain(
      'const price = billing === "monthly" ? tier.monthly : tier.annual;'
    );
    const rowPrice = c.match(
      /<p className="shrink-0 font-display text-2xl[^>]*>([\s\S]*?)<\/p>/
    );
    expect(rowPrice).not.toBeNull();
    expect((rowPrice as RegExpMatchArray)[1]).toContain("${price.toFixed(2)}");
    expect((rowPrice as RegExpMatchArray)[1]).toContain(
      '{billing === "monthly" ? " / month" : " / year"}'
    );
    expect(c).toContain("{tier.credits.toLocaleString()} Oracles a month");
  });
});

describe("Pricing feature lists: only what exists in code (3/3/2)", () => {
  it("Spark lists 3 lines: readings, follow-ups", () => {
    expect(featuresOf(client(), "spark")).toEqual([
      "1-card readings",
      "3-card readings",
      "Follow-up questions",
    ]);
  });

  it("Star lists 3 lines as a delta on Spark", () => {
    expect(featuresOf(client(), "star")).toEqual([
      "Everything in Spark",
      "Chart readings",
      "Your journal and reading history",
    ]);
  });

  it("Moon lists 2 lines as a delta on Star", () => {
    expect(featuresOf(client(), "moon")).toEqual([
      "Everything in Star",
      "Reports: transit, year-ahead, and relationship",
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

describe("Pricing video formula: one badge, one highlighted tier, one primary button", () => {
  it("has exactly one Most popular badge, on Star only", () => {
    const c = client();
    expect([...c.matchAll(/<Badge/g)].length).toBe(1);
    const badges = [...c.matchAll(/<Badge[^>]*\/>/g)].map((m) => m[0]);
    expect(badges).toHaveLength(1);
    expect(badges.filter((b) => b.includes('label="Most popular"'))).toHaveLength(1);
    // Batch 4.3: no "Coming soon" badges anywhere (Velu, 2026-11-16).
    // The tier and top-up buttons carry their own state instead
    // ("Not yet open" while the checkout is gated).
    expect(badges.filter((b) => b.includes('label="Coming soon"'))).toHaveLength(0);
    expect(c).not.toContain('label="Coming soon"');
    expect(c).toContain("{star.popular && <Badge");
    expect([...c.matchAll(/popular: true,/g)].length).toBe(1);
  });

  it("marks Star as the focal panel, Spark and Moon as quiet rows (F08, Velu 2026-11-17)", () => {
    const c = client();
    // UX audit Phase 2, F08, as re-decided by Velu 2026-11-17:
    // the old lock is CANCELLED, identical-size tier cards with
    // Star marked by border/badge/glow only. Star is now the one
    // large focal panel (gold border, glow, badge, larger type);
    // Spark and Moon are quiet hairline rows, no boxes, no
    // backgrounds. The -translate-y-4 lift is still gone: it made Star's card and button sit 16px higher than
    // the others. The glow is the shadow-gold-lg token (F17),
    // now on the Star article, and the animated StarBorder frame
    // is gone with the equal-cards grid.
    expect(c).not.toContain("-translate-y-4");
    expect(c).not.toContain("translate-y");
    expect(c).not.toContain("StarBorder");
    expect(c).not.toContain('columns={{ minWidth: 300, max: 3 }}');
    // The tier section is a two-column Grid: Star's panel on one
    // side, the Spark/Moon rows on the other.
    expect(c).toContain('columns={{ minWidth: 440, max: 2 }}');
    expect(c).toContain('data-tier="star"');
    expect(c).toContain('className="relative h-full rounded-3xl shadow-gold-lg"');
    // Gold border only, no bg-gold/10 on the Card: the Card's navy
    // background IS the panel, and a Tailwind bg utility overrides
    // the theme card background, which left the panel light while
    // the dark scope still made the text light (unreadable in the
    // browser check, 2026-11-17). The border, glow, badge and
    // larger type mark Star instead.
    expect(c).toContain('className="border-gold"');
    expect(c).not.toContain('className="border-gold bg-gold/10"');
    // The rows are grouped by hairline rules, not boxes: one
    // divide-y parent, no Card around Spark or Moon. Two <Card
    // sites in the file: Star's panel and the top-up cards.
    expect(c).toContain('className="divide-y divide-gold/25"');
    expect([...c.matchAll(/<Card/g)].length).toBe(2);
  });

  it("has one primary button (Star) and outlined secondary on Spark/Moon, plus a secondary top-up button", () => {
    const c = client();
    // Phase 2 batch 3: two Buttons — the tier button and the
    // top-up button. The tier button is primary on Star, secondary
    // on Spark/Moon; the top-up button is always secondary.
    expect([...c.matchAll(/<Button/g)].length).toBe(2);
    const buttons = [...c.matchAll(/<Button[\s\S]*?\/>/g)].map((m) => m[0]);
    expect(buttons).toHaveLength(2);
    const tierButton = buttons.find((b) => b.includes("Choose ${tier.name}"));
    expect(tierButton).toBeDefined();
    expect(tierButton).toContain('variant={tier.id === "star" ? "primary" : "secondary"}');
    // Gated on the server prop: disabled until the variants are
    // configured, enabled after.
    expect(tierButton).toContain("isDisabled={!subscriptionsEnabled}");
    // Batch 4.3 (#64): the state sits on the button itself, not in
    // a single badge above the grid — a disabled tier button reads
    // "Not yet open", never "Coming soon".
    expect(tierButton).toContain('"Not yet open"');
    const topUpButton = buttons.find((b) => b.includes("Top up ${topup.credits.toLocaleString()}"));
    expect(topUpButton).toBeDefined();
    expect(topUpButton).toContain('variant="secondary"');
    expect(topUpButton).toContain("isDisabled={!topupsEnabled}");
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
    // Velu 2026-11-17: the savings line exists twice now, once
    // in Star's panel (star.savings) and once in the Spark/Moon
    // rows (tier.savings). Both must say the same thing.
    const savings = [...c.matchAll(
      /<p className="mt-1 text-sm font-semibold text-goldbright[^>]*>([\s\S]*?)<\/p>/g
    )].map((m) => m[1]);
    expect(savings).toHaveLength(2);
    expect(savings[0]).toContain(
      "Save $<CountUp value={star.savings} /> a year"
    );
    expect(savings[1]).toContain(
      "Save $<CountUp value={tier.savings} /> a year"
    );
    expect(c).toContain('{billing === "annual" && (');
  });

  it("shows both top-ups with exact prices, never expiring, state on the button", () => {
    const c = client();
    const topups = c.match(/const TOPUPS = \[([\s\S]*?)\];/);
    expect(topups).not.toBeNull();
    expect((topups as RegExpMatchArray)[1]).toContain("{ credits: 1000, price: 9.99 }");
    expect((topups as RegExpMatchArray)[1]).toContain("{ credits: 3000, price: 24.99 }");
    expect(c).toContain("Never expires");
    expect(c).toContain("Top up any time");
    // Batch 4.3: no "Coming soon" badge on the top-ups section.
    // The state sits on each top-up button ("Not yet open" while
    // the checkout is gated). The copy states the prices plainly,
    // with no "launch with subscriptions" promise.
    expect(c).not.toContain('label="Coming soon"');
    expect(c).not.toContain("Top-ups launch with subscriptions");
    expect(c).not.toContain("anyone can buy them");
  });

  it("shows no Oracle packs: they are retired, with a link to /oracles for top-ups", () => {
    // Packs retired (Velu, 2026-11-16, D1): the pricing page
    // shows subscriptions and top-ups only. No pack section, no
    // pack data, no packsEnabled prop anywhere on the page.
    const c = client();
    expect(c).not.toContain('import { CREDIT_PACKS } from "@/lib/site";');
    expect(c).not.toContain("Oracle packs — available now");
    expect(c).not.toContain("CREDIT_PACKS.map");
    expect(c).not.toContain("packsEnabled");
    expect(c).not.toContain('aria-labelledby="packs-heading"');
    expect(c).not.toContain("First Light");
    expect(c).not.toContain("Constellation");
    expect(c).not.toContain("Celestial Treasury");
    // The cancelled credit cutover's cost table is gone: no
    // per-reading credit costs (100/200/300/50) anywhere on the page.
    // Assert on the JSX, not the whole file: the header comment
    // above TIERS names the removed table, so a whole-file
    // not.toContain would fail on the documentation itself.
    expect(c).not.toContain("CREDIT_COSTS");
    expect(c).not.toContain('aria-labelledby="costs-heading"');
    expect(c).not.toContain('id="costs-heading"');
    expect(c).not.toContain("Planned costs for subscriptions");
  });
});

describe("Pricing honesty: gated CTAs, packs link, checkout wiring", () => {
  it("renders tier buttons gated on the config prop, and the footer points to top-ups", () => {
    const c = client();
    const button = c.match(/<Button[\s\S]*?\/>/);
    expect(button).not.toBeNull();
    // Phase 2 batch 3: the tier button is disabled only while the
    // variants are unconfigured (the server prop), not forever.
    expect((button as RegExpMatchArray)[0]).toContain("isDisabled={!subscriptionsEnabled}");
    // Batch 4.3: no "open soon" language. Packs retired (Velu,
    // 2026-11-16, D1): the line under the grid points to top-ups,
    // never to packs.
    expect(c).not.toContain("Oracle packs available now.");
    expect(c).not.toContain("See Oracle packs");
    expect(c).not.toContain("Subscriptions open soon");
    expect(c).not.toContain("Coming soon");
    expect(c).toContain("See top-ups");
    const link = c.match(
      /<Link href="\/oracles"[^>]*>([\s\S]*?)<\/Link>/
    );
    expect(link).not.toBeNull();
    expect((link as RegExpMatchArray)[1]).toContain("See top-ups");
  });

  it("wires checkout to the subscription route only (no invented route)", () => {
    // Phase 2 batch 3: the tier and top-up buttons POST to the one
    // subscription checkout route. No Lemon Squeezy client call, no
    // invented /pricing/checkout or /subscribe route.
    const c = client();
    const p = page();
    expect(c).toContain('fetch("/api/checkout/subscription"');
    expect(c).toContain('checkout("subscription",');
    expect(c).toContain('checkout("topup",');
    expect(c).toContain("window.location.assign(data.url)");
    expect(c).not.toContain("/pricing/checkout");
    expect(c).not.toContain("/subscribe");
    expect(p).not.toContain("/api/checkout");
    expect(p).toContain("subscriptionsConfigured()");
    expect(p).toContain("topUpsConfigured()");
    expect(p).toContain("subscriptionsEnabled={subscriptionsConfigured() && CREDIT_COSTS_ENABLED}");
    expect(p).toContain("topupsEnabled={topUpsConfigured() && CREDIT_COSTS_ENABLED}");
  });

  it("leaves /oracles selling top-ups only: the packs are retired there too", () => {
    const oracles = src("src/app/oracles/page.tsx");
    expect(oracles).toContain("Top up Oracles");
    expect(oracles).toContain("TOPUPS.map");
    expect(oracles).toContain("TopUpBuyButton");
    expect(oracles).not.toContain("Oracle packs");
    expect(oracles).not.toContain("CREDIT_PACKS.map");
    expect(oracles).not.toContain("PackBuyButton");
    expect(oracles).not.toContain("Most popular");
    expect(existsSync(path.resolve(process.cwd(), "src/app/oracles/PackBuyButton.tsx"))).toBe(false);
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
    // the palette to drift. Assert the token reference, not the
    // fallback hex: pinning the fallback would make a theme edit
    // require a test edit as well, the sync cost the P1 was
    // about (Sonnet nit, PR #88).
    expect(body).toContain("--color-cream: var(--color-text-primary");
    expect(body).toContain("--color-goldbright: var(--color-text-accent");
    expect(body).toContain("--color-gold: var(--color-accent");
    expect(body).toContain("--color-panel: var(--color-background-card");
    // No bare hex as the primary value: a duplicate palette.
    expect(body).not.toContain("--color-cream: #ede6d6;");
    expect(body).not.toContain("--color-goldbright: #f4d03f;");
    // The scope must NOT flip the page background itself: the
    // pricing page background stays the light paper (#ede6d6). That
    // colour appears in the scope only as the --color-cream var()
    // fallback, so the check is for a background property, not the hex.
    expect(body).not.toContain("background:");
  });

  it("applies the dark scope inside the tier Cards and the top-up Cards, nowhere else", () => {
    const c = client();
    // One occurrence in the Star panel, one in the top-up map.
    // (Packs retired, Velu 2026-11-16 D1: the packs Cards are gone.)
    // Spark and Moon are quiet rows on the light paper now, so
    // they carry no dark scope: only Star's panel and the top-up
    // Cards do.
    expect([...c.matchAll(/pricing-card-dark/g)].length).toBe(2);
    // The {0} in gap={0} must be escaped: unescaped, {0} is a
    // regex quantifier (zero of the preceding token), so the
    // literal "gap=" would never match. The match is anchored to
    // the closing </Card> (Sonnet nit, PR #88): a bare lazy
    // [\s\S]*?</VStack> stops at the first closing VStack, so a
    // nested VStack inside a card would silently shorten what the
    // test checks. A nested close is never followed by </Card>,
    // so the lazy match skips it and lands on the real close.
    const tierStack = c.match(
      /<VStack gap=\{0\} className="pricing-card-dark h-full text-left">([\s\S]*?)<\/VStack>\s*<\/Card>/
    );
    expect(tierStack).not.toBeNull();
    expect((tierStack as RegExpMatchArray)[1]).toContain("{star.name}");
    expect((tierStack as RegExpMatchArray)[1]).toContain("${starPrice.toFixed(2)}");
    const topupStack = c.match(
      /<VStack gap=\{0\} className="pricing-card-dark text-center">([\s\S]*?)<\/VStack>\s*<\/Card>/
    );
    expect(topupStack).not.toBeNull();
    expect((topupStack as RegExpMatchArray)[1]).toContain("${topup.price.toFixed(2)}");
    // The page-level hero VStack (Pricing eyebrow, h1, intro) sits
    // on the light paper and must NOT carry the dark scope. The
    // count of 2 above plus the two VStack regexes already pin
    // placement; no whitespace-fragile negative assertion is
    // needed (Sonnet nit, PR #88).
    expect(c).toContain('<VStack gap={0} className="text-center">');
  });

  it("keeps the card text on the existing Tailwind classes (no new colours invented)", () => {
    // The fix is a token-scope change only: the card text still
    // uses text-cream / text-cream/75 / text-cream/85 /
    // text-goldbright, which now resolve to the dark stops inside
    // the scope. No hex, no arbitrary var() colour, no new class.
    // Velu 2026-11-17: Star's panel is larger now, name text-4xl
    // and price text-5xl; the Spark/Moon rows use text-2xl names.
    const c = client();
    expect(c).toContain('className="mt-3 font-display text-4xl text-goldbright"');
    expect(c).toContain('className="mt-4 font-display text-5xl font-bold leading-none text-goldbright');
    expect(c).toContain('className="font-display text-2xl text-goldbright"');
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
    // Phase 2 batch 3: the page passes the Lemon Squeezy config
    // (read at request time) into the client as props. The buttons
    // ALSO need the credit flag ON (Codex P1): a subscription or
    // top-up grants credits, and while the spend path still charges
    // 1 per reading those credits would buy 1,000 readings for
    // $9.99. The flag flips first in the cutover.
    expect(p).toContain("<PricingClient");
    expect(p).toContain("subscriptionsEnabled={subscriptionsConfigured() && CREDIT_COSTS_ENABLED}");
    expect(p).toContain("topupsEnabled={topUpsConfigured() && CREDIT_COSTS_ENABLED}");
    // Packs retired (Velu, 2026-11-16, D1): the server page no
    // longer passes a packsEnabled prop — there is no pack section
    // left to gate.
    expect(p).not.toContain("packsEnabled");
    expect(p).toContain('title: "Pricing"');
    expect(p).toContain('canonical: "/pricing"');
    // Phase 2 batch 3: the meta/OG descriptions describe the live
    // subscriptions (the checkout is wired). Batch 4.3 removed the
    // "Coming soon" state: the buttons carry their own "Not yet
    // open" label, gated on the config props.
    expect(p).toContain("Sortes subscriptions: Spark $9.99");
    expect(p).not.toContain("coming soon");
  });

  it("renders tiers with Astryx Card / Badge / Button, CountUp, no StarBorder", () => {
    const c = client();
    expect(c).toContain('import { Card } from "@astryxdesign/core/Card";');
    expect(c).toContain('import { Badge } from "@astryxdesign/core/Badge";');
    expect(c).toContain('import { Button } from "@astryxdesign/core/Button";');
    expect(c).toContain('import CountUp from "@/components/CountUp";');
    expect(c).toContain("<Card");
    // Velu 2026-11-17: the animated StarBorder frame is gone
    // with the equal-cards grid. Star is marked by its panel
    // (gold border, gold tint, glow, badge, larger type) instead.
    expect(c).not.toContain("StarBorder");
    expect(c).not.toContain('from "@/components/ReactBits"');
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
    // No raw <div> left: the mt-auto spacer inside each tier Card
    // is gone with the equal-height cards (Velu, 2026-11-17) —
    // the Star panel and the Spark/Moon rows no longer share a
    // row of equal cards, so the button sits directly after the
    // features with mt-6. Count JSX divs only: the file's
    // comments mention <div> without the className form, so
    // match the className form.
    expect([...c.matchAll(/<div className="/g)].length).toBe(0);
    expect(c).not.toContain('<div className="mt-auto pt-6">');
    expect(c).not.toContain('<div className="mt-4">');
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
