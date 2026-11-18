import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Solid gold wordmark (Velu 2026-11-18): the SORTES wordmark in the
// header is a solid gold fill, not gradient text. This supersedes the
// earlier locked gold gradient. Dark theme uses the gold token
// (var(--color-gold), #d4af37); light theme uses dark gold #7c5e00 so
// it stays readable on cream. The drop-shadow glow stays in both.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

const css = src("src/app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");

// Every top-level rule whose selector targets .wordmark.
const rules = (css.match(/[^{}]+\{[^{}]*\}/g) ?? [])
  .map((r) => {
    const [selector, body] = r.split("{");
    return { selector: selector.trim(), body };
  })
  .filter((r) => /\.wordmark\b/.test(r.selector));

const dark = rules.filter((r) => r.selector === ".wordmark");
const light = rules.filter((r) => r.selector === 'html[data-theme="light"] .wordmark');

describe("SORTES wordmark is solid gold, no gradient", () => {
  it("globals.css has exactly one dark and one light .wordmark rule", () => {
    expect(dark).toHaveLength(1);
    expect(light).toHaveLength(1);
    expect(rules).toHaveLength(2);
  });

  it("no .wordmark rule uses a gradient or the clip-to-text trick", () => {
    for (const r of rules) {
      expect(r.body).not.toMatch(/gradient/i);
      expect(r.body).not.toMatch(/background-clip/i);
      expect(r.body).not.toMatch(/color:\s*transparent/i);
      expect(r.body).not.toMatch(/(^|[;\s])background(-image)?\s*:/i);
    }
  });

  it("dark .wordmark is the gold token", () => {
    expect(dark[0].body).toMatch(/(^|[;\s])color:\s*var\(--color-gold\)\s*;/);
  });

  it("light .wordmark is dark gold #7c5e00", () => {
    expect(light[0].body).toMatch(/(^|[;\s])color:\s*#7c5e00\s*;/i);
  });

  it("both rules keep the drop-shadow glow", () => {
    expect(dark[0].body).toMatch(/filter:\s*drop-shadow\(/);
    expect(light[0].body).toMatch(/filter:\s*drop-shadow\(/);
  });

  it("Header.tsx still renders the wordmark span", () => {
    expect(src("src/components/Header.tsx")).toMatch(
      /<span className="wordmark font-display text-xl tracking-wide sm:text-2xl">/,
    );
  });
});
