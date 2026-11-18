import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Hero visual and pricing preview", () => {
  it("wires the hero video into the homepage hero, below the question box", () => {
    // Hero video (Velu, 2026-11-18): his own Flow deck-shuffle
    // loop is the hero visual now, in place of the Phase 2 3D
    // fan. The 3D scene files stay on disk for now, unwired;
    // removing them is a follow-up, not this change.
    const page = src("src/app/page.tsx");
    expect(page).toContain('import HeroVideo from "@/components/HeroVideo"');
    expect(page).toContain("<HeroVideo");
    expect(page).not.toContain("HeroScene");
    // Below the question form and the example chips, not above them:
    // the question box stays first and usable before the video loads.
    const heroVideoAt = page.indexOf("<HeroVideo");
    expect(heroVideoAt).toBeGreaterThan(page.indexOf('id="hero-question"'));
    expect(heroVideoAt).toBeGreaterThan(page.indexOf("Example questions"));
  });

  it("renders the fan of three real cards with a gold moon behind", () => {
    const hero = src("src/components/Hero3D.tsx");
    expect(hero).toContain("/cards/major-00-fool.jpg");
    expect(hero).toContain("/cards/major-01-magician.jpg");
    expect(hero).toContain("/cards/major-02-high-priestess.jpg");
    // Gold moon disc behind the cards.
    expect(hero).toContain("color={BRAND.gold}");
    // Calm and slow: a gentle sway, never a spin.
    expect(hero).toContain("Math.sin(t * 0.22)");
    expect(hero).not.toContain("Math.PI * 2");
  });

  it("falls back to a static fan for reduced motion and on video load failure", () => {
    // Hero video (Velu, 2026-11-18): reduced-motion visitors
    // get the poster still, never an autoplaying video, and a
    // load failure falls back to the static fan. The Phase 2
    // HeroScene 3D loader is no longer wired; the static fan
    // itself stays, as the video's fallback.
    const video = src("src/components/HeroVideo.tsx");
    expect(video).toContain("prefers-reduced-motion");
    expect(video).toContain("HeroFanStatic");
    expect(video).toContain("hero-deck-shuffle-poster.jpg");
    expect(video).toContain("onError");
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

  it("adds a pricing preview with Star as the focal panel and Spark and Moon as quiet rows", () => {
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
