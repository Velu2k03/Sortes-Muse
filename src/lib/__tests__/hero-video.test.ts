import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "fs";
import path from "path";

// Hero video (Velu decided 2026-11-18, "Go" 2026-11-18,
// revised 2026-11-18: background, not a section): his own
// Flow deck-shuffle loop plays behind the hero content on the
// homepage hero and on /daily. File is his velu-shared-video.mp4,
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
    expect(text).toContain("showVideo = mounted && !reducedMotion && isDark");
    // First-paint / mid-session CSS guard (PR #154 pattern):
    // reduced-motion users never see a playing video element.
    const reduceBlock = css().split("@media (prefers-reduced-motion: reduce)")[1];
    expect(reduceBlock).toContain(".hero-video video");
    expect(reduceBlock).toContain("display: none !important");
  });

  it("does not mount or autoplay a hidden video in light theme, and follows theme toggles", () => {
    const text = video();
    // Codex P2, PR #163: on light-theme visits the CSS hides
    // .hero-video-bg, but the component still mounted an
    // autoplaying video and called play() on it, downloading
    // and decoding 2.5 MB it never displayed. Now the
    // component tracks the live theme and renders nothing in
    // light theme, so no <video> mounts at all.
    expect(text).toContain("document.documentElement.dataset.theme");
    expect(text).toContain("isDark");
    expect(text).toContain("showVideo = mounted && !reducedMotion && isDark");
    expect(text).toContain("if (mounted && !isDark) {");
    expect(text).toContain("return null;");
    // Two subscriptions, because the Header has two writers:
    // the toggle sets the attribute AND dispatches
    // sortes-theme-change, while the OS-following path sets
    // the attribute without dispatching, so a MutationObserver
    // on data-theme catches that one too. Toggling dark to
    // light unmounts the video (isDark flips false, the early
    // return fires); light to dark mounts it again.
    expect(text).toContain('addEventListener("sortes-theme-change"');
    expect(text).toContain("new MutationObserver(");
    expect(text).toContain('attributeFilter: ["data-theme"]');
    expect(text).toContain("observer.disconnect()");
    // The play effect re-runs when the theme flips, so a
    // light-to-dark toggle actually starts the video.
    expect(text).toContain("[mounted, reducedMotion, isDark, failed]");
  });

  it("falls back to the static fan if the video fails to load", () => {
    const text = video();
    expect(text).toContain("onError={() => setFailed(true)}");
    expect(text).toContain("if (failed) {");
    // The fallback is centred inside the same background layer,
    // under the same scrim, so the hero never shows an empty box
    // and the text above it stays readable.
    expect(text).toContain("hero-video-bg absolute inset-0 overflow-hidden bg-navydeep");
    expect(text).toContain("<HeroFanStatic />");
    expect(text).toContain("import HeroFanStatic from \"./HeroFanStatic\"");
  });

  it("is a background layer behind the hero content, not a section block", () => {
    const text = video();
    // The component IS the absolute full-bleed background layer:
    // video or poster object-cover, scrim on top of the video,
    // hero content in a relative sibling above it. The old
    // section-box shape (aspect-video, rounded border box, width
    // cap) is gone.
    expect(text).toContain("hero-video-bg absolute inset-0 overflow-hidden");
    expect(text).toContain("hero-video-scrim absolute inset-0");
    expect(text).toContain("absolute inset-0 h-full w-full object-cover");
    expect(text).not.toContain("aspect-video");
    expect(text).not.toContain("rounded-2xl");
    expect(text).not.toContain("max-w-4xl");
  });

  it("lays a strong dark scrim between video and content, and hides the layer in light theme", () => {
    const text = video();
    expect(text).toContain("hero-video-scrim");
    const cssText = css();
    // Strong on purpose: the busiest mid-shuffle frames carry
    // bright cream and yellow cards, and bright gold text on
    // bright yellow is unreadable. 0.78 top, 0.85 through the
    // middle where the form and chips sit, 0.94 at the bottom.
    expect(cssText).toContain(".hero-video-scrim");
    expect(cssText).toContain("rgb(10 14 26 / 0.78)");
    expect(cssText).toContain("rgb(10 14 26 / 0.85)");
    expect(cssText).toContain("rgb(10 14 26 / 0.94)");
    // Light-theme text is dark gold and dark navy on paper, and
    // no dark scrim can save that over a dark navy video, so the
    // whole layer hides there, same pattern as the old hero photo.
    expect(cssText).toContain('html[data-theme="light"] .hero-video-bg');
    const lightRule = cssText.split('html[data-theme="light"] .hero-video-bg')[1];
    expect(lightRule).toContain("display: none");
  });

  it("is the homepage hero background, behind the question box, in place of the 3D fan", () => {
    const text = home();
    expect(text).toContain("<HeroVideo");
    expect(text).toContain("import HeroVideo from \"@/components/HeroVideo\"");
    expect(text).not.toContain("HeroScene");
    // The old hero photo is gone: the video is the background now.
    expect(text).not.toContain("hero-bg.jpg");
    // The background layer renders before the hero content in the
    // file, so the headline, form, chips and free line sit above
    // it; and the old section block below the question box is gone.
    expect(text.indexOf("<HeroVideo")).toBeLessThan(text.indexOf('id="hero-question"'));
    expect(text).not.toContain('<div className="mt-6 w-full">');
    // The question box, the free-availability line, and the
    // sections below the hero are untouched by the swap.
    expect(text).toContain("hero-question");
    expect(text).toContain("Your first reading is free");
    expect(text).toContain("What&apos;s on your mind?");
  });

  it("sits behind the /daily heading, above the ritual, never inside the draw flow", () => {
    const text = daily();
    expect(text).toContain("<HeroVideo />");
    expect(text).toContain("import HeroVideo from \"@/components/HeroVideo\"");
    // The video renders before the heading in the file (it sits
    // behind it in the hero panel), and the hero panel sits
    // above the draw container.
    expect(text.indexOf("<HeroVideo />")).toBeLessThan(
      text.indexOf("Your Daily Card"),
    );
    expect(text.indexOf("<HeroVideo />")).toBeLessThan(
      text.indexOf("min-h-[24rem]"),
    );
    // The draw flow is untouched: same hold time, same
    // 1400ms ritual pause, same draw function.
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
