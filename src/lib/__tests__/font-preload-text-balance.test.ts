/**
 * All-pages fix 8 (font preload + preconnect + text-balance):
 * the audit reported "no font preload, no preconnect" and
 * "text-wrap: balance in only 2 places, both on the homepage".
 *
 * Font half: the audit's preload finding was a source-grep miss.
 * Both fonts load through next/font/google, which self-hosts them
 * at build time and serves them from this same domain, and
 * injects <link rel="preload" as="font"> for the latin subsets
 * when preload is true (the next/font default). No request goes
 * to Google at runtime, so there is no Google Fonts origin to
 * preconnect to. This test locks the real state: preload written
 * out explicitly on both loaders, no Google Fonts origin anywhere
 * in layout.tsx, and a preconnect only to Plausible — the one
 * external origin this layout actually fetches from — gated on
 * the same env var as the analytics script.
 *
 * Balance half: one rule in globals.css balances every h1/h2 on
 * every page, including headings rendered through shared
 * components (PageHeader, SplitText, GateScreen) that a per-file
 * grep misses. No heading wording, alignment, size, or colour
 * is changed by this fix.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("font preload + preconnect (all-pages fix 8)", () => {
  const layout = src("src/app/layout.tsx");

  it("preloads both fonts explicitly through next/font/google", () => {
    expect(layout).toContain("Cormorant_Garamond({");
    expect(layout).toContain("Manrope({");
    // One preload: true per loader, both of them.
    expect(layout.match(/preload: true/g)?.length).toBe(2);
  });

  it("sends no font request to Google at runtime, so no Google preconnect", () => {
    expect(layout).not.toContain("fonts.googleapis.com");
    expect(layout).not.toContain("fonts.gstatic.com");
    expect(layout).not.toContain("preconnect\" href=\"https://fonts.");
  });

  it("preconnects only to Plausible, and only when analytics is configured", () => {
    const preconnect = '<link rel="preconnect" href="https://plausible.io" />';
    expect(layout).toContain(preconnect);
    // The link must sit inside the plausibleDomain conditional,
    // next to the script it serves — no dead hint when analytics
    // is off.
    const conditional = layout.indexOf("plausibleDomain && (");
    expect(conditional).toBeGreaterThan(-1);
    expect(layout.indexOf(preconnect)).toBeGreaterThan(conditional);
    expect(layout).toContain('src="https://plausible.io/js/script.js"');
  });
});

describe("text-balance on h1/h2 (all-pages fix 8)", () => {
  const css = src("src/app/globals.css");

  it("balances every h1 and h2 with one rule in globals.css", () => {
    // The rule as written: h1, h2 { text-wrap: balance; }
    expect(css).toMatch(/h1,\s*h2\s*\{\s*text-wrap:\s*balance;\s*\}/);
  });

  it("does not add a third font or change the brand font stacks", () => {
    expect(css).toContain('"Cormorant Garamond"');
    expect(css).toContain('"Manrope"');
    expect(css).not.toContain('"Inter"');
  });

  it("keeps the two existing text-balance classes (homepage h1, GuidesSearch h2)", () => {
    expect(src("src/app/page.tsx")).toContain("text-balance font-display");
    // Gold rationing (Velu 2026-11-18): the GuidesSearch h2 is cream.
    expect(src("src/components/GuidesSearch.tsx")).toContain("text-balance text-cream");
  });
});
