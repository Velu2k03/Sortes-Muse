/**
 * Wait-screen auto-follow (Velu 2026-11-18): while a reading
 * streams in on the intake wait screen (ProcessingStage in
 * IntakeSteps.tsx), the page follows the newest streamed line so it
 * stays in view. Hand-built, no new dependency.
 *
 * Locked here:
 * - it follows: when the newest line drops below the viewport, the
 *   page scrolls just enough to bring it back, and not at all when
 *   it is already in view (quiet, no jumps);
 * - scroll-up pause: an upward user scroll with the newest line out
 *   of view stops following, downward scrolls (ours included) never
 *   pause it, and following resumes once the newest line is back in
 *   view;
 * - wheel/touch pause (2026-11-19): html scroll-behavior is smooth,
 *   so a follow scrollBy cancels an in-progress smooth wheel scroll
 *   and scrollY never drops. The pause therefore also registers on
 *   the input itself: a passive wheel listener (deltaY < 0) and a
 *   touchstart/touchmove pair (finger down past 8px = page up), all
 *   wired to followingRef and cleaned up; the scroll listener stays
 *   as the backstop (keyboard, scrollbar drags);
 * - no resume mid-gesture (2026-11-19): an upward scroll never
 *   resumes following (nextFollowing is direction-aware), and the
 *   follow effect stands down for FOLLOW_PAUSE_MS after any upward
 *   input (wheel, touch, or upward scroll), before its resume line
 *   and before any scrollBy;
 * - reduced motion: the existing live matchMedia check
 *   (useChartsClient.ts pattern) picks "auto", never "smooth", and
 *   globals.css keeps html scroll-behavior auto under reduce, so the
 *   move is instant;
 * - scope: only the wait screen uses it, on the streamed text block.
 *
 * Pure helpers are tested by behaviour (same convention as
 * focusStepElement in batch3a-wiring.test.ts); the hook wiring by
 * source inspection (deck-tilt.test.ts, reduced-motion-followups).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FOLLOW_MARGIN_PX,
  followScrollBehavior,
  followScrollDelta,
  isFollowEndInView,
  nextFollowing,
} from "@/app/intake/[slug]/IntakeSteps";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");

// Slice of the hook, so assertions cannot match other code in the file.
function hook(): string {
  const start = steps.indexOf("export function useWaitAutoFollow<");
  const end = steps.indexOf("export function ProcessingStage(", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return steps.slice(start, end);
}

function processingStage(): string {
  const start = steps.indexOf("export function ProcessingStage(");
  const end = steps.indexOf("export function StepDots(", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return steps.slice(start, end);
}

const VH = 800;

describe("auto-follow: following the newest line", () => {
  it("scrolls only by the distance that brings the newest line back into view", () => {
    // Newest line ends 100px below the viewport bottom: scroll it to
    // FOLLOW_MARGIN_PX above the bottom.
    expect(followScrollDelta(VH + 100, VH)).toBe(100 + FOLLOW_MARGIN_PX);
    // Fractional layout values round up so the line is fully shown.
    expect(followScrollDelta(VH + 10.2, VH)).toBe(Math.ceil(10.2 + FOLLOW_MARGIN_PX));
  });

  it("does not move when the newest line is already in view (quiet)", () => {
    expect(followScrollDelta(VH - FOLLOW_MARGIN_PX, VH)).toBe(0);
    expect(followScrollDelta(300, VH)).toBe(0);
    expect(followScrollDelta(-50, VH)).toBe(0);
  });

  it("treats the newest line as in view up to a small slack below the fold", () => {
    expect(isFollowEndInView(VH, VH)).toBe(true);
    expect(isFollowEndInView(VH + FOLLOW_MARGIN_PX, VH)).toBe(true);
    expect(isFollowEndInView(VH + FOLLOW_MARGIN_PX + 1, VH)).toBe(false);
  });
});

describe("auto-follow: scroll-up pause", () => {
  it("an upward user scroll with the newest line out of view pauses following", () => {
    expect(nextFollowing(true, VH + 400, VH, 900, 1000)).toBe(false);
  });

  it("downward scrolls never pause it (the follow itself only scrolls down)", () => {
    expect(nextFollowing(true, VH + 400, VH, 1100, 1000)).toBe(true);
    expect(nextFollowing(true, VH + 400, VH, 1000, 1000)).toBe(true);
  });

  it("stays paused while the user reads earlier lines, even scrolling down a bit", () => {
    expect(nextFollowing(false, VH + 400, VH, 950, 900)).toBe(false);
    expect(nextFollowing(false, VH + 400, VH, 850, 900)).toBe(false);
  });

  it("resumes once the user scrolls back to the newest line", () => {
    expect(nextFollowing(false, VH - 10, VH, 1400, 1300)).toBe(true);
  });

  it("a small upward scroll that keeps the newest line in view does not pause", () => {
    expect(nextFollowing(true, VH - 40, VH, 990, 1000)).toBe(true);
  });

  it("never resumes on an upward scroll, even with the newest line in view", () => {
    // Paused by the wheel listener, then the wheel-up's first scroll
    // events land with the end still inside the slack: stay paused.
    expect(nextFollowing(false, VH + FOLLOW_MARGIN_PX, VH, 990, 1000)).toBe(false);
    expect(nextFollowing(false, VH - 40, VH, 990, 1000)).toBe(false);
  });

  it("keeps the current state on an upward scroll with the newest line in view", () => {
    expect(nextFollowing(true, VH - 40, VH, 990, 1000)).toBe(true);
    expect(nextFollowing(false, VH - 40, VH, 990, 1000)).toBe(false);
  });

  it("still resumes on a downward scroll to the newest line", () => {
    expect(nextFollowing(false, VH - 10, VH, 1010, 1000)).toBe(true);
    expect(nextFollowing(false, VH + FOLLOW_MARGIN_PX, VH, 1010, 1000)).toBe(true);
  });

  it("the follow effect stands down right after upward input, before resuming or scrolling", () => {
    const h = hook();
    expect(steps).toContain("const FOLLOW_PAUSE_MS = 400;");
    expect(h).toContain("const lastUpAtRef = useRef(0);");
    const follow = h.slice(h.indexOf("}, []);"), h.indexOf("}, [streamedText]);"));
    const guard = "if (Date.now() - lastUpAtRef.current < FOLLOW_PAUSE_MS) return;";
    const g = follow.indexOf(guard);
    expect(g).toBeGreaterThan(-1);
    // The guard comes before the resume line and before any scroll.
    expect(g).toBeLessThan(
      follow.indexOf("if (isFollowEndInView(endBottom, window.innerHeight)) followingRef.current = true;"),
    );
    expect(g).toBeLessThan(follow.indexOf("window.scrollBy("));
    expect(g).toBeLessThan(follow.indexOf("getBoundingClientRect()"));
  });

  it("onScroll, onWheel and onTouchMove all record the last upward input", () => {
    const h = hook();
    const body = (name: string, next: string) => h.slice(h.indexOf(`const ${name} = `), h.indexOf(next));
    expect(body("onScroll", "const onWheel = ")).toContain("if (y < lastY) lastUpAtRef.current = Date.now();");
    expect(body("onWheel", "let touchStartY")).toContain("if (e.deltaY < 0) lastUpAtRef.current = Date.now();");
    expect(body("onTouchMove", 'window.addEventListener("scroll"')).toContain(
      "if (y !== undefined && y - touchStartY > 8) lastUpAtRef.current = Date.now();",
    );
    // onScroll records before lastY is overwritten.
    const scroll = body("onScroll", "const onWheel = ");
    expect(scroll.indexOf("lastUpAtRef.current = Date.now();")).toBeLessThan(scroll.indexOf("lastY = y;"));
  });

  it("the hook wires the pause to a passive window scroll listener and cleans it up", () => {
    const h = hook();
    expect(h).toContain('window.addEventListener("scroll", onScroll, { passive: true });');
    expect(h).toContain('return () => {\n      window.removeEventListener("scroll", onScroll);');
    expect(h).toContain("followingRef.current = nextFollowing(");
    // A paused reader is never pulled down: the follow effect returns
    // before scrolling when following is off.
    expect(h).toContain("if (!followingRef.current) return;");
    // Following resumes when new text lands where the reader is.
    expect(h).toContain(
      "if (isFollowEndInView(endBottom, window.innerHeight)) followingRef.current = true;",
    );
    // The follow runs on each streamed-text update.
    expect(h).toContain("}, [streamedText]);");
  });

  it("a wheel scroll up pauses on the input event itself, passive", () => {
    // A follow scrollBy cancels an in-progress smooth wheel scroll,
    // so the pause cannot wait for scrollY to drop.
    const h = hook();
    expect(h).toContain('window.addEventListener("wheel", onWheel, { passive: true });');
    expect(h).toContain("if (e.deltaY < 0) followingRef.current = false;");
  });

  it("a touch drag that scrolls the page up pauses on touchmove, passive", () => {
    const h = hook();
    expect(h).toContain('window.addEventListener("touchstart", onTouchStart, { passive: true });');
    expect(h).toContain('window.addEventListener("touchmove", onTouchMove, { passive: true });');
    expect(h).toContain("touchStartY = e.touches[0]?.clientY ?? 0;");
    // Finger moving down past 8px = page scrolling up.
    expect(h).toContain("if (y !== undefined && y - touchStartY > 8) followingRef.current = false;");
  });

  it("all four listeners register in the one mount effect and are all cleaned up", () => {
    const h = hook();
    const mount = h.slice(0, h.indexOf("}, []);"));
    for (const [type, fn] of [
      ["scroll", "onScroll"],
      ["wheel", "onWheel"],
      ["touchstart", "onTouchStart"],
      ["touchmove", "onTouchMove"],
    ]) {
      expect(mount).toContain(`window.addEventListener("${type}", ${fn}, { passive: true });`);
      expect(mount).toContain(`window.removeEventListener("${type}", ${fn});`);
    }
    expect(h.match(/addEventListener\(/g) ?? []).toHaveLength(4);
    expect(h.match(/removeEventListener\(/g) ?? []).toHaveLength(4);
  });
});

describe("auto-follow: reduced motion", () => {
  it("reduced-motion users get an instant move, never smooth", () => {
    expect(followScrollBehavior(true)).toBe("auto");
    expect(followScrollBehavior(false)).toBe("smooth");
  });

  it("uses the existing live matchMedia check at each scroll, no new hook", () => {
    const h = hook();
    expect(h).toContain(
      'const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;',
    );
    expect(h).toContain("window.scrollBy({ top: delta, behavior: followScrollBehavior(reduce) });");
    // No frozen Motion value and no new reduced-motion hook.
    expect(h).not.toContain("useReducedMotion");
    expect(h).not.toContain("usePrefersReducedMotion");
    expect(h).not.toContain('"smooth"');
  });

  it("globals.css keeps html scroll-behavior auto under reduced motion", () => {
    const css = src("src/app/globals.css");
    const start = css.indexOf("@media (prefers-reduced-motion: reduce) {\n  *,");
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, start + 400);
    expect(block).toContain("html {\n    scroll-behavior: auto;\n  }");
  });
});

describe("auto-follow: scope", () => {
  it("only the wait screen uses it, on the streamed text block", () => {
    const stage = processingStage();
    expect(stage).toContain("const followRef = useWaitAutoFollow<HTMLDivElement>(streamedText);");
    expect(stage).toContain(
      '<div ref={followRef} className="mt-3">\n            <ReadingText text={streamedText} />',
    );
    expect(steps.match(/useWaitAutoFollow</g) ?? []).toHaveLength(2); // definition + one call
    expect(steps.match(/window\.scrollBy\(/g) ?? []).toHaveLength(1);
  });

  it("the stream itself and the status lines are unchanged", () => {
    const flow = src("src/app/intake/[slug]/useIntakeFlow.ts");
    expect(flow).toContain("if (now - lastFlushRef.current >= 150) {");
    expect(flow).not.toContain("scrollBy");
    expect(src("src/components/ReadingWait.tsx")).not.toContain("useWaitAutoFollow");
  });

  it("adds no scroll dependency", () => {
    const pkg = src("package.json");
    for (const dep of ["use-stick-to-bottom", "react-scroll-to-bottom", "react-scroll", "smoothscroll"]) {
      expect(pkg).not.toContain(`"${dep}"`);
    }
  });
});
