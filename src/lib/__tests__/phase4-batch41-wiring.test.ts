import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Phase 4 Batch 4.1 Oracles page", () => {
  const page = src("src/app/oracles/page.tsx");
  const buy = src("src/app/oracles/PackBuyButton.tsx");
  const credits = src("src/app/oracles/CreditsClient.tsx");

  it("uses brand tokens for the pack badges, not raw old-gold hex", () => {
    expect(page).toContain("Most popular");
    expect(page).toContain("Best value");
    expect(page).toContain("bg-gold/15");
    expect(page).toContain("text-goldbright");
    expect(page).not.toContain("#14100a");
    expect(page).not.toContain("#f4d03f");
    expect(page).not.toContain("#d4af37");
  });

  it("says what is happening while checkout opens", () => {
    expect(buy).toContain('"Opening checkout…"');
    expect(buy).not.toContain('? "…"');
  });

  it("points guests at the free reading, and takes the counter colour from a token", () => {
    expect(credits).toContain("Start your free reading");
    expect(credits).not.toContain("Ask your question");
    expect(credits).toContain('textColor="var(--color-cream)"');
    expect(credits).not.toContain("#1c1a15");
    expect(credits).not.toContain("#ede6d6");
    // The theme-tracking workaround is gone with the hard colour.
    expect(credits).not.toContain("siteTheme");
    expect(credits).not.toContain("MutationObserver");
  });
});
