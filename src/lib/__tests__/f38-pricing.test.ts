/**
 * UX audit Phase 2, F38 (pricing).
 * The subhead said "Top-ups arrive with subscriptions", which
 * confuses two different things, and repeated "never expire"
 * (said again in the top-up section below). The Spark list
 * carried "Daily card free, every day", which is redundant: the
 * daily card is free for everyone. The Star and Moon lists
 * repeated the headline Oracle count. Each line now adds a fact
 * the headline does not carry.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("F38 pricing says each thing once", () => {
  it("the subhead separates top-ups from subscriptions", () => {
    const c = src("src/components/PricingClient.tsx").replace(/\s+/g, " ");
    expect(c).toContain("Top-ups are one-time purchases, separate from subscriptions.");
    expect(c).not.toContain("Top-ups arrive with subscriptions");
  });

  it("no feature line repeats the headline Oracle count", () => {
    const c = src("src/components/PricingClient.tsx").replace(/\s+/g, " ");
    expect(c).not.toContain("Daily card free, every day");
    expect(c).not.toContain("plus 1,500 more Oracles a month");
    expect(c).not.toContain("plus 3,500 more Oracles a month");
    expect(c).toContain('"Everything in Spark"');
    expect(c).toContain('"Everything in Star"');
  });

  it("has no Pricing eyebrow above the H1 (F14, Hallmark gate 54)", () => {
    const c = src("src/components/PricingClient.tsx");
    expect(c).not.toContain('<p className="text-sm text-gold">Pricing</p>');
  });
});
