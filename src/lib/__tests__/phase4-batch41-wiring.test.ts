import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Phase 4 Batch 4.1 Oracles page", () => {
  const page = src("src/app/oracles/page.tsx");
  const credits = src("src/app/oracles/CreditsClient.tsx");

  it("sells top-ups only, with brand tokens and no pack copy", () => {
    // Packs retired (Velu, 2026-11-16, D1): the page renders the
    // two top-ups (1,000 / 3,000 credits) and nothing pack-shaped.
    // Credit cutover: the heading says credits; the URL stays /oracles.
    expect(page).toContain("Top up credits");
    expect(page).toContain('alternates: { canonical: "/oracles" }');
    expect(page).toContain("TOPUPS.map");
    expect(page).toContain("TopUpBuyButton");
    expect(page).toContain("text-goldbright");
    expect(page).not.toContain("Oracle packs");
    expect(page).not.toContain("CREDIT_PACKS");
    expect(page).not.toContain("PackBuyButton");
    expect(page).not.toContain("Most popular");
    expect(page).not.toContain("Best value");
    expect(page).not.toContain("First Light");
    expect(page).not.toContain("Constellation");
    expect(page).not.toContain("Celestial Treasury");
  });

  it("gates the top-up buttons and the JSON-LD availability on cutover readiness (Codex P2, PR #118)", () => {
    // The checkout route 503s while CREDIT_COSTS_ENABLED is off
    // or the top-up variants are unconfigured, so the page must
    // not offer an active Buy button or an InStock offer until
    // then — same readiness the pricing page uses.
    expect(page).toContain("topUpsConfigured() && CREDIT_COSTS_ENABLED");
    expect(page).toContain("enabled={topupsEnabled}");
    expect(page).toContain("OutOfStock");
    expect(page).toContain("InStock");
    const buy = src("src/app/oracles/TopUpBuyButton.tsx");
    expect(buy).toContain("enabled = false");
    expect(buy).toContain("disabled={!enabled || processing}");
    expect(buy).toContain('"Not yet open"');
  });

  it("points guests at the free reading, and takes the counter colour from a token", () => {
    expect(credits).toContain("Start your free reading");
    expect(credits).not.toContain("Ask your question");
    expect(credits).toContain('textColor="var(--color-cream)"');
    expect(credits).not.toContain("#1c1a15");
    expect(credits).not.toContain("#faf6ec");
    // The theme-tracking workaround is gone with the hard colour.
    expect(credits).not.toContain("siteTheme");
    expect(credits).not.toContain("MutationObserver");
  });
});
