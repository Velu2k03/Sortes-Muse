import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Scroll-progress bar in quiet gold (design-library audits
// S-35/S-36b/S-37b/S-38b, 2026-11-18; Velu approved
// 2026-11-18): long guide and methodology pages have
// scroll-mt anchors but no reading-position indicator.
// Chosen implementation is the Magic UI scroll-progress
// pattern, hand-built in Sortes' own code, NOT the library:
// a fixed bar, bar only, recolored from Magic UI's
// violet-pink-peach gradient to quiet solid gold. No
// Magic UI, RareUI, Aceternity, or 21st.dev install, no
// new dependency, no tailwind-merge, no
// class-variance-authority, no lucide-react.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

// The component's header comment names the libraries it is
// NOT using and the gradient it is NOT using, so absence
// assertions must run on the code, not the prose: strip
// line comments first. The component has no `//` inside
// strings, so a line-comment strip is safe here.
const codeOnly = (text: string) =>
  text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");

const bar = () => codeOnly(src("src/components/ScrollProgressBar.tsx"));
const layout = () => src("src/app/layout.tsx");
const css = () => src("src/app/globals.css");

describe("scroll-progress bar", () => {
  it("is hand-built from motion, not a library install", () => {
    const text = bar();
    expect(text).toContain("useScroll");
    expect(text).toContain("useSpring");
    expect(text).toContain("from \"motion/react\"");
    expect(text).not.toContain("magicui");
    expect(text).not.toContain("@magicui");
    expect(text).not.toContain("rare-ui");
    expect(text).not.toContain("aceternity");
    expect(text).not.toContain("21st.dev");
    expect(text).not.toContain("tailwind-merge");
    expect(text).not.toContain("lucide-react");
  });

  it("is a quiet solid gold bar, fixed at the top, no gradient", () => {
    const text = bar();
    expect(text).toContain("fixed");
    expect(text).toContain("top-0");
    expect(text).toContain("bg-gold");
    expect(text).toContain("origin-left");
    expect(text).toContain("scaleX");
    expect(text).toContain("aria-hidden");
    // 2px tall: h-0.5. No gradient anywhere in the bar:
    // Magic UI's violet-pink-peach gradient is explicitly
    // not used, and no violet, pink, or peach colour is.
    expect(text).toContain("h-0.5");
    expect(text).not.toContain("gradient");
    expect(text).not.toContain("violet");
    expect(text).not.toContain("pink");
    expect(text).not.toContain("peach");
    expect(text).not.toContain("linear-gradient");
  });

  it("sits above the sticky Header without covering content", () => {
    const text = bar();
    // Header is sticky z-40 (Header.tsx); the bar is z-50,
    // a 2px hairline at the very top edge, so it never
    // covers the H1, nav links, or the 3D fan.
    expect(text).toContain("z-50");
    expect(text).toContain("left-0");
    expect(text).toContain("right-0");
  });

  it("respects reduced motion in JS and in CSS", () => {
    const text = bar();
    // Motion's useReducedMotion is frozen at first render
    // in this Motion version (PR #154), so the component
    // uses a matchMedia subscription hook instead, same
    // pattern as ReactBitsNew.tsx: it starts false
    // (server-identical), syncs after mount, and unmounts
    // the bar for reduced-motion users.
    expect(text).toContain("matchMedia(\"(prefers-reduced-motion: reduce)\")");
    expect(text).toContain("addEventListener(\"change\"");
    expect(text).toContain("if (reduce) return null");
    expect(text).not.toContain("useReducedMotion");
    // First-paint CSS guard (PR #154 pattern): the bar is
    // in the SSR HTML while useReducedMotion is still null,
    // so the reduce block in globals.css hides it before
    // hydration for reduced-motion users.
    const reduceBlock = css().split("@media (prefers-reduced-motion: reduce)")[1];
    expect(reduceBlock).toContain(".scroll-progress-bar");
    expect(reduceBlock).toContain("display: none !important");
  });

  it("is rendered site-wide in the root layout, exactly once", () => {
    const text = layout();
    expect(text).toContain("ScrollProgressBar");
    expect(text).toContain("<ScrollProgressBar />");
    const uses = text.match(/<ScrollProgressBar \/>/g) ?? [];
    expect(uses).toHaveLength(1);
  });

  it("has no expanding menu, beam, plane, or percentage text", () => {
    const text = bar();
    expect(text).not.toContain("menu");
    expect(text).not.toContain("beam");
    expect(text).not.toContain("plane");
    expect(text).not.toContain("%");
    expect(text).not.toContain("percent");
  });
});
