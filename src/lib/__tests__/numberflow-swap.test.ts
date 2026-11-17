import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

// All-pages fix 6 (NumberFlow swap, 2026-11-17): the in-house
// CountUp is gone, replaced by the curated pick for animating
// numbers. The Header Oracle balance and both PricingClient
// savings lines now render NumberFlow. Counter stays in-house:
// its intro spin, motion blur and spring bounce have no
// NumberFlow equivalent, so swapping it would change behaviour.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

const header = () => src("src/components/Header.tsx");
const pricing = () => src("src/components/PricingClient.tsx");
const counter = () => src("src/components/Counter.tsx");

describe("NumberFlow swap (all-pages fix 6)", () => {
  it("Header Oracle balance renders NumberFlow, not the old component", () => {
    const c = header();
    expect(c).toContain('import NumberFlow from "@number-flow/react";');
    expect(c).toContain("<NumberFlow");
    expect(c).toContain("value={credits}");
    expect(c).toContain("format={NUMBERFLOW_FORMAT}");
    expect(c).toContain("transformTiming={NUMBERFLOW_TIMING}");
    expect(c).toContain('<span className="num">');
    expect(c).not.toContain('from "@/components/CountUp"');
    expect(c).not.toContain("<CountUp");
  });

  it("PricingClient savings render NumberFlow on Star and on the other tiers", () => {
    const c = pricing();
    expect(c).toContain('import NumberFlow from "@number-flow/react";');
    expect(c).toContain("value={star.savings}");
    expect(c).toContain("value={tier.savings}");
    expect(c).toContain("format={NUMBERFLOW_FORMAT}");
    expect(c).toContain("transformTiming={NUMBERFLOW_TIMING}");
    expect(c).not.toContain('from "@/components/CountUp"');
    expect(c).not.toContain("<CountUp");
  });

  it("keeps the 500ms token and the ungrouped format at every swapped site", () => {
    for (const c of [header(), pricing()]) {
      expect(c).toContain("duration: 500");
      expect(c).toContain("cubic-bezier(0.215, 0.61, 0.355, 1)");
      expect(c).toContain("useGrouping: false");
    }
  });

  it("pins a Latin-digit locale at every swapped site (PR #149 blocker)", () => {
    // Codex P2: without `locales`, NumberFlow uses the visitor's
    // browser locale, and a locale such as fa-IR formats integers
    // with non-Latin digits this version does not support, while
    // the deleted CountUp always rendered Latin digits. `locales`
    // is a separate NumberFlow prop, not a key of `format`
    // (Intl.NumberFormatOptions has no locales field), so it must
    // be passed as its own prop at every site.
    for (const c of [header(), pricing()]) {
      expect(c).toContain('const NUMBERFLOW_LOCALES = "en-US";');
      expect(c).toContain("locales={NUMBERFLOW_LOCALES}");
    }
    expect(header().match(/locales=\{NUMBERFLOW_LOCALES\}/g)).toHaveLength(1);
    expect(pricing().match(/locales=\{NUMBERFLOW_LOCALES\}/g)).toHaveLength(2);
  });

  it("deletes the in-house CountUp file", () => {
    expect(existsSync(path.resolve(process.cwd(), "src/components/CountUp.tsx"))).toBe(
      false
    );
    expect(existsSync(path.resolve(process.cwd(), "src/components/Counter.tsx"))).toBe(
      true
    );
  });

  it("leaves Counter in-house for its two uses, with the reason recorded", () => {
    expect(src("src/app/oracles/CreditsClient.tsx")).toContain(
      'import Counter from "@/components/Counter";'
    );
    expect(src("src/app/reports/ReportsClient.tsx")).toContain(
      'import Counter from "@/components/Counter";'
    );
    expect(counter()).toContain("LEFT HAND-BUILT");
    expect(counter()).toContain("intro spin");
    expect(counter()).not.toContain("number-flow");
  });

  it("adds only @number-flow/react, no other number library", () => {
    const pkg = JSON.parse(src("package.json")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies["@number-flow/react"]).toBeDefined();
    expect(pkg.dependencies["@number-flow/react"]).toMatch(/^\^?0\.6\./);
  });
});
