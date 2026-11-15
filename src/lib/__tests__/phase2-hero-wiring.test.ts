import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Phase 2 3D hero and pricing preview", () => {
  it("wires the 3D hero scene into the homepage hero, below the question box", () => {
    const page = src("src/app/page.tsx");
    expect(page).toContain('import HeroScene from "@/components/HeroScene"');
    expect(page).toContain("<HeroScene />");
    // Below the question form and the example chips, not above them:
    // the question box stays first and usable before the 3D loads.
    const heroSceneAt = page.indexOf("<HeroScene />");
    expect(heroSceneAt).toBeGreaterThan(page.indexOf('id="hero-question"'));
    expect(heroSceneAt).toBeGreaterThan(page.indexOf("Example questions"));
  });

  it("renders the fan of three real cards with a gold moon behind", () => {
    const hero = src("src/components/Hero3D.tsx");
    expect(hero).toContain("/cards/major-00-fool.jpg");
    expect(hero).toContain("/cards/major-01-magician.jpg");
    expect(hero).toContain("/cards/major-02-high-priestess.jpg");
    // Gold moon disc behind the cards.
    expect(hero).toContain('color="#b9975b"');
    // Calm and slow: a gentle sway, never a spin.
    expect(hero).toContain("Math.sin(t * 0.22)");
    expect(hero).not.toContain("Math.PI * 2");
  });

  it("falls back to a static fan for reduced motion and while the 3D chunk loads", () => {
    const scene = src("src/components/HeroScene.tsx");
    expect(scene).toContain("prefers-reduced-motion");
    expect(scene).toContain("HeroFanStatic");
    expect(scene).toContain('ssr: false');
    const fallback = src("src/components/HeroFanStatic.tsx");
    expect(fallback).toContain("/cards/major-00-fool.jpg");
    expect(fallback).toContain("/cards/major-01-magician.jpg");
    expect(fallback).toContain("/cards/major-02-high-priestess.jpg");
  });

  it("keeps the 3D hero canvas full opacity in light theme (Starfield only is dimmed)", () => {
    const starfield = src("src/components/Starfield.tsx");
    expect(starfield).toContain("starfield-canvas");
    const css = src("src/app/globals.css");
    expect(css).toContain('html[data-theme="light"] canvas.starfield-canvas');
    expect(css).not.toContain('html[data-theme="light"] canvas {');
  });

  it("adds a pricing preview with the three plans as identical cards", () => {
    const page = src("src/app/page.tsx");
    expect(page).toContain('aria-label="Pricing preview"');
    expect(page).toContain("Simple plans, clear prices");
    for (const [name, price] of [
      ["Spark", "$9.99"],
      ["Star", "$19.99"],
      ["Moon", "$39.99"],
    ]) {
      expect(page).toContain(name);
      expect(page).toContain(price);
    }
    // Star is popular by border and badge, never by height.
    expect(page).toContain("Most popular");
    expect(page).toContain('href="/pricing"');
    expect(page).toContain("See full pricing");
  });

  it("adds a subtle grain texture to the hero", () => {
    const page = src("src/app/page.tsx");
    expect(page).toContain("hero-texture");
    const css = src("src/app/globals.css");
    expect(css).toContain(".hero-texture::after");
  });
});
