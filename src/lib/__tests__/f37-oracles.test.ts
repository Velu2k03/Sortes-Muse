/**
 * UX audit Phase 2, F37 (oracles).
 * "Never expire" was said three times on the page (subhead,
 * top-up cards, balance line). It is said once now, on the
 * top-up cards, where the purchase promise belongs. The three
 * small-print paragraphs are one footnote block, same facts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("F37 oracles says never expire once", () => {
  it("keeps the promise on the top-up cards only", () => {
    const page = src("src/app/oracles/page.tsx").replace(/\s+/g, " ");
    expect(page).toContain("Never expires");
    // The visible subhead states the cost only now. (The page
    // metadata description still carries the promise for the search
    // snippet; that is a different surface, not page copy.)
    const subhead = page.match(/<p className="mt-2 text-sm font-semibold text-goldbright">([\s\S]*?)<\/p>/);
    expect(subhead).not.toBeNull();
    expect((subhead as RegExpMatchArray)[1]).toContain("One reading costs 1 Oracle.");
    expect((subhead as RegExpMatchArray)[1]).not.toContain("never expire");
    const client = src("src/app/oracles/CreditsClient.tsx").replace(/\s+/g, " ");
    expect(client).not.toContain("never expire");
  });

  it("merges the three small-print paragraphs into one footnote", () => {
    const page = src("src/app/oracles/page.tsx").replace(/\s+/g, " ");
    // All three facts survive in one block.
    expect(page).toContain("Pay with cards, PayPal, Apple Pay, or Google Pay through Lemon Squeezy");
    expect(page).toContain("Prices are in US dollars");
    expect(page).toContain("Unused top-ups can be refunded within 14 days of purchase");
    // The old three-paragraph block is gone.
    expect(page).not.toContain("Available methods can vary by region and device.");
  });
});
