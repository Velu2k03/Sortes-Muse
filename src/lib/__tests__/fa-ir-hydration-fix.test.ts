import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// fa-IR hydration fix (all-pages follow-up, 2026-11-17): bare
// toLocaleString() uses the runtime default locale, so the server
// renders "1,000" while a fa-IR client renders Persian digits and
// React throws #418 on hydration. Every server-rendered credits
// number must pin en-US so server and client agree. Visible
// formatting for Latin-locale users is unchanged ("1,000" /
// "2,500" with the comma grouping).

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe("fa-IR hydration fix: credits numbers pin en-US", () => {
  it("PricingClient pins en-US on all four credits lines, no bare call left", () => {
    const c = src("src/components/PricingClient.tsx");
    expect(c).toContain('const CREDITS_LOCALE = "en-US";');
    expect(count(c, /toLocaleString\(CREDITS_LOCALE\)/g)).toBe(4);
    expect(c).not.toContain("toLocaleString()");
    expect(c).toContain("{star.credits.toLocaleString(CREDITS_LOCALE)}");
    expect(c).toContain(
      "{tier.credits.toLocaleString(CREDITS_LOCALE)} Oracles a month"
    );
    expect(c).toContain("{topup.credits.toLocaleString(CREDITS_LOCALE)}");
    expect(c).toContain(
      "Top up ${topup.credits.toLocaleString(CREDITS_LOCALE)} Oracles"
    );
  });

  it("/oracles pins en-US on all three credits lines, no bare call left", () => {
    const c = src("src/app/oracles/page.tsx");
    expect(c).toContain('const CREDITS_LOCALE = "en-US";');
    expect(count(c, /toLocaleString\(CREDITS_LOCALE\)/g)).toBe(3);
    expect(c).not.toContain("toLocaleString()");
    // JSON-LD offer name, visible h2, and buy-button label.
    expect(c).toContain(
      "name: `${t.credits.toLocaleString(CREDITS_LOCALE)} Oracles`"
    );
    expect(c).toContain("{t.credits.toLocaleString(CREDITS_LOCALE)} Oracles");
    expect(c).toContain(
      "label={`Buy ${t.credits.toLocaleString(CREDITS_LOCALE)} for $${t.price.toFixed(2)}`}"
    );
  });

  it("StatsStrip is exempt: it renders null until the client fetch lands", () => {
    // StatsStrip's number only appears after a useEffect fetch, so
    // the server and the first client render both output nothing
    // and there is no hydrated text to mismatch. Its one
    // toLocaleString() is therefore not part of this fix.
    const c = src("src/components/StatsStrip.tsx");
    expect(c).toContain("if (n === null || n < MIN_TO_SHOW) return null;");
    expect(c).toContain('fetch("/api/stats")');
  });

  it("Counter already pins en-US by default, so it needs no change", () => {
    const c = src("src/components/Counter.tsx");
    expect(c).toContain("locale = 'en-US',");
  });

  it("en-US formatting is the grouping users already see", () => {
    expect((1000).toLocaleString("en-US")).toBe("1,000");
    expect((2500).toLocaleString("en-US")).toBe("2,500");
    expect((3000).toLocaleString("en-US")).toBe("3,000");
  });
});
