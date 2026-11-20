import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Hero visual and pricing preview", () => {
  it("wires the hero video as the background of the homepage hero, behind the question box", () => {
    // Hero video (Velu, 2026-11-18, revised 2026-11-18: "make
    // the video as bg, not as a section"): his own Flow
    // deck-shuffle loop plays behind the hero content, full-
    // bleed, in place of the Phase 2 3D fan and the old hero
    // photo. The 3D scene files (HeroScene, Hero3D) were removed
    // after being unwired since PR #163.
    const page = src("src/app/page.tsx");
    expect(page).toContain('import HeroVideo from "@/components/HeroVideo"');
    expect(page).toContain("<HeroVideo");
    expect(page).not.toContain("HeroScene");
    expect(page).not.toContain("hero-bg.jpg");
    // The background layer renders before the hero content in
    // the file, so the headline, form, chips and free line sit
    // above it; the old section block below the question box is
    // gone.
    const heroVideoAt = page.indexOf("<HeroVideo");
    expect(heroVideoAt).toBeLessThan(page.indexOf('id="hero-question"'));
    expect(page).not.toContain('<div className="mt-6 w-full">');
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
