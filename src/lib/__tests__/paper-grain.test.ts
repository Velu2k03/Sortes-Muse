/**
 * Site-wide paper grain (Velu 2026-11-18): the hero's static SVG
 * feTurbulence grain (Phase 2, #84) now also covers every page via
 * body::before in globals.css. Static SVG only: no JS noise, no
 * canvas, no animation, no transform, no new dependency.
 *
 * The site-wide layer is fixed to the viewport at z-index -1: above
 * the flat ink page background and the Starfield canvas (-z-10),
 * below all in-flow content, so text, the hero video, the /daily
 * card, the Header (z-40), the scroll-progress bar and modals
 * (z-50) all paint above it. pointer-events none, so it never takes
 * a click. A CSS pseudo-element, not a raw element in the layout,
 * so no AGENTS.md self-check exception is needed.
 *
 * Source-inspection tests, same convention as deck-tilt.test.ts and
 * reduced-motion-followups.test.ts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

const css = src("src/app/globals.css");

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

// The whole grain block: from its Phase 2 comment to the next rule
// (html scroll-behavior), so assertions cannot match other CSS.
function grainBlock(): string {
  const start = css.indexOf("/* Phase 2 subtle texture");
  const end = css.indexOf("html {\n  scroll-behavior: smooth;", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return css.slice(start, end);
}

// One rule body, from `selector {` to its closing brace.
function rule(selectorStart: number): string {
  expect(selectorStart).toBeGreaterThan(-1);
  const end = css.indexOf("}", selectorStart);
  expect(end).toBeGreaterThan(selectorStart);
  return css.slice(selectorStart, end + 1);
}

const sharedRule = () => rule(css.indexOf(".hero-texture::after,\nbody::before {"));
const heroRule = () => rule(css.indexOf("\n.hero-texture::after {"));
// lastIndexOf: the shared rule also contains "\nbody::before {".
const bodyRule = () => rule(css.lastIndexOf("\nbody::before {"));

describe("site-wide paper grain", () => {
  it("uses one static SVG feTurbulence data URI, shared with the hero", () => {
    const shared = sharedRule();
    expect(shared).toContain('background-image: url("data:image/svg+xml,');
    expect(shared).toContain("feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'");
    // Exactly one noise tile in the stylesheet: reused, not duplicated.
    // Comments are stripped first: the block comment above names
    // feTurbulence in prose, and that must not count as a tile.
    const code = stripComments(css);
    expect(code.match(/feTurbulence/g) ?? []).toHaveLength(1);
    expect(code.match(/data:image\/svg\+xml/g) ?? []).toHaveLength(1);
  });

  it("is feTurbulence only: no canvas, no JS noise", () => {
    const block = stripComments(grainBlock());
    expect(block).not.toMatch(/canvas/i);
    // No grain component or script wired into the layout.
    const layout = src("src/app/layout.tsx");
    expect(layout).not.toMatch(/grain|noise/i);
  });

  it("never intercepts clicks", () => {
    expect(sharedRule()).toContain("pointer-events: none;");
  });

  it("opacity is in the 0.03-0.05 range", () => {
    const m = sharedRule().match(/^\s*opacity:\s*([\d.]+);/m);
    expect(m).not.toBeNull();
    const opacity = Number(m![1]);
    expect(opacity).toBeGreaterThanOrEqual(0.03);
    expect(opacity).toBeLessThanOrEqual(0.05);
    // Neither selector overrides it in its own rule.
    expect(heroRule()).not.toContain("opacity");
    expect(bodyRule()).not.toContain("opacity");
  });

  it("site-wide layer is fixed to the viewport, below content", () => {
    const body = bodyRule();
    expect(body).toContain("position: fixed;");
    expect(body).toContain("inset: 0;");
    expect(body).toContain("z-index: -1;");
    // It stays above the Starfield canvas, which keeps its -z-10.
    expect(src("src/components/Starfield.tsx")).toContain("fixed inset-0 -z-10");
    // The Header and scroll-progress bar layers are unchanged.
    expect(src("src/components/Header.tsx")).toContain(
      '<header className="sticky top-0 z-40',
    );
    expect(src("src/components/ScrollProgressBar.tsx")).toContain(
      "fixed left-0 right-0 top-0 z-50",
    );
  });

  it("is static: no animation, keyframes, transition or transform", () => {
    const block = stripComments(grainBlock());
    expect(block).not.toMatch(/animation|@keyframes|transition|transform|will-change/);
  });

  it("adds no dependency", () => {
    const pkg = JSON.parse(src("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
    expect(names.filter((n) => /noise|grain|perlin|simplex/i.test(n))).toEqual([]);
  });

  it("the hero .hero-texture rule still works", () => {
    const hero = heroRule();
    expect(hero).toContain("position: absolute;");
    expect(hero).toContain("inset: 0;");
    expect(src("src/app/page.tsx")).toContain(
      '<section className="hero-texture relative overflow-hidden">',
    );
  });
});
