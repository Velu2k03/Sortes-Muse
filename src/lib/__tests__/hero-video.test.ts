import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "fs";
import path from "path";

// Hero video (Velu decided 2026-11-18, "Go" 2026-11-18): his
// own Flow deck-shuffle loop is the hero visual on the homepage
// hero and on /daily. File is his velu-shared-video.mp4,
// shipped as-is, only re-encoded for size (8.96 MB to 2.56 MB,
// libx264 CRF 26, 1280x720 kept, audio stripped, the source is
// silent), plus a poster still from its 1s frame. No new
// dependency, no library, hand-built in Sortes' own code.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

const video = () => src("src/components/HeroVideo.tsx");
const home = () => src("src/app/page.tsx");
const daily = () => src("src/app/daily/page.tsx");
const css = () => src("src/app/globals.css");

describe("hero video", () => {
  it("plays muted, looping, inline, with poster and metadata preload", () => {
    const text = video();
    expect(text).toContain("<video");
    expect(text).toContain("muted");
    expect(text).toContain("loop");
    expect(text).toContain("playsInline");
    expect(text).toContain("autoPlay");
    expect(text).toContain("preload=\"metadata\"");
    expect(text).toContain("poster={POSTER_SRC}");
    expect(text).toContain("src={VIDEO_SRC}");
    expect(text).toContain("/videos/hero-deck-shuffle.mp4");
    expect(text).toContain("/videos/hero-deck-shuffle-poster.jpg");
    // The video is decorative ambience, no audio, no information:
    // it is hidden from assistive tech, the wrapper carries the
    // description instead.
    expect(text).toContain("aria-hidden=\"true\"");
    expect(text).toContain("aria-label=\"Tarot cards shuffling in a deck, looping video\"");
  });

  it("sets muted as a property, not just an attribute", () => {
    // React's muted attribute does not reliably stick on
    // <video> across browsers, and an unmuted video will not
    // autoplay. The component sets el.muted = true after mount.
    const text = video();
    expect(text).toContain("el.muted = true");
    expect(text).toContain("el.play()");
  });

  it("respects reduced motion in JS and in CSS", () => {
    const text = video();
    // Motion's useReducedMotion is frozen at first render in
    // this Motion version (PR #154), so the component uses a
    // matchMedia subscription, same pattern as HeroScene and
    // ReactBitsNew.tsx: it starts unmounted (server renders the
    // poster only), syncs after mount, and keeps the poster for
    // reduced-motion users.
    expect(text).toContain("matchMedia(\"(prefers-reduced-motion: reduce)\")");
    expect(text).toContain("addEventListener(\"change\"");
    expect(text).toContain("!reducedMotion");
    expect(text).not.toContain("useReducedMotion");
    expect(text).toContain("showVideo = mounted && !reducedMotion");
    // First-paint / mid-session CSS guard (PR #154 pattern):
    // reduced-motion users never see a playing video element.
    const reduceBlock = css().split("@media (prefers-reduced-motion: reduce)")[1];
    expect(reduceBlock).toContain(".hero-video video");
    expect(reduceBlock).toContain("display: none !important");
  });

  it("falls back to the static fan if the video fails to load", () => {
    const text = video();
    expect(text).toContain("onError={() => setFailed(true)}");
    expect(text).toContain("if (failed) return <HeroFanStatic />");
    expect(text).toContain("import HeroFanStatic from \"./HeroFanStatic\"");
  });

  it("is the homepage hero visual, in place of the 3D fan", () => {
    const text = home();
    expect(text).toContain("<HeroVideo");
    expect(text).toContain("import HeroVideo from \"@/components/HeroVideo\"");
    expect(text).not.toContain("HeroScene");
    // The question box, the free-availability line, and the
    // sections below the hero are untouched by the swap.
    expect(text).toContain("hero-question");
    expect(text).toContain("Your first reading is free");
    expect(text).toContain("What&apos;s on your mind?");
  });

  it("sits on /daily above the ritual, never inside the draw flow", () => {
    const text = daily();
    expect(text).toContain("<HeroVideo />");
    expect(text).toContain("import HeroVideo from \"@/components/HeroVideo\"");
    // The video renders before the draw container in the file,
    // and the draw flow is untouched: same hold time, same
    // 1400ms ritual pause, same draw function.
    expect(text.indexOf("<HeroVideo />")).toBeLessThan(
      text.indexOf("min-h-[24rem]"),
    );
    expect(text).toContain("holdTime={1200}");
    expect(text).toContain("}, 1400)");
    expect(text).toContain("const draw = () => {");
    expect(text).toContain("<HoldCard");
  });

  it("ships the video and poster under public/videos, sensibly sized", () => {
    const videoPath = path.resolve(process.cwd(), "public/videos/hero-deck-shuffle.mp4");
    const posterPath = path.resolve(process.cwd(), "public/videos/hero-deck-shuffle-poster.jpg");
    expect(existsSync(videoPath)).toBe(true);
    expect(existsSync(posterPath)).toBe(true);
    // Re-encoded from 8.96 MB: must stay well under the source
    // size so the hero does not cost 9 MB on first load.
    expect(statSync(videoPath).size).toBeLessThan(4_000_000);
    expect(statSync(posterPath).size).toBeGreaterThan(10_000);
  });
});
