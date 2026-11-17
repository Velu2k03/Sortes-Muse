/**
 * All-pages follow-ups to fix 10 (PR #147 Codex P2s): the two
 * non-blocking follow-ups Codex left on the browser-verify CHECK
 * fix. Neither broke the #418 fix; both are fixed here.
 *
 * P2-1: MotionConfig reducedMotion="user" disables transform/layout
 * animations but preserves opacity animations, so the guides list
 * (AnimatedList) still faded in with staggered delays for
 * reduced-motion users instead of being fully static.
 * P2-2: the Orb's one-time isReducedMotion() check at mount never
 * reacted if a visitor enabled reduced motion mid-session, so the
 * pointer-follow kept moving the orbs.
 *
 * PR #154 Codex P2 on P2-1: the hook alone does not cover the
 * initial load, it still returns false until its effect runs, so
 * rows mount with the opacity-zero entrance. The first paint is
 * covered by CSS instead: each row carries className
 * "animated-list-item" and globals.css forces opacity 1 / no
 * transform under prefers-reduced-motion: reduce, !important
 * beating Motion's inline style. CSS loads before JS, no React
 * tree change, no hydration risk.
 *
 * Both fixes share one hook, usePrefersReducedMotion, the same
 * pattern useChartPrefs and DeckClient use: state starts false
 * (server-identical first render, no #418) and an effect syncs the
 * real preference and subscribes to mid-session changes. The
 * rendered tree never branches on the preference, only animation
 * props and effect behaviour change.
 *
 * Browser results, production build, port 3132:
 * - /guides under prefers-reduced-motion: reduce: every list item
 *   is opacity 1 immediately, no fade, no stagger; under normal
 *   motion the same items fade in over ~0.35s with stagger.
 * - Homepage Orb under normal motion: moving the pointer over the
 *   hero sets --orb-x/--orb-y off 0; emulating reduced motion
 *   mid-session parks both back at 0px and further pointer moves
 *   leave them at 0; turning reduced motion back off re-attaches
 *   the follow.
 * - Zero React #418 under reduced motion on / and /guides, zero
 *   console errors, no overflow at 1280px or 390px.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

// Slice of ReactBitsNew.tsx for one component, so assertions about
// a render branch or an effect cannot accidentally match the other
// component's code.
function component(file: string, name: string, next: string): string {
  const start = file.indexOf(`export function ${name}(`);
  const end = file.indexOf(`export function ${next}(`, start);
  expect(start).toBeGreaterThan(-1);
  return file.slice(start, end === -1 ? undefined : end);
}

describe("reduced-motion follow-ups (PR #147 P2s)", () => {
  const file = src("src/components/ReactBitsNew.tsx");

  it("shares one live reduced-motion hook, hydration-safe", () => {
    // State starts false, matching the server render; the effect
    // syncs the real preference and subscribes to mid-session
    // changes. Motion's own useReducedMotion is frozen at first
    // render in this version (see IntakeSteps), so it cannot do
    // the mid-session part.
    expect(file).toContain("function usePrefersReducedMotion(): boolean {");
    expect(file).toContain("const [reduced, setReduced] = useState(false);");
    expect(file).toContain('window.matchMedia("(prefers-reduced-motion: reduce)")');
    expect(file).toContain('mq.addEventListener("change", sync);');
    expect(file).toContain('mq.removeEventListener("change", sync);');
  });

  it("AnimatedList is fully static for reduced-motion users, fades otherwise", () => {
    const list = component(file, "AnimatedList", "Orb");
    // No render branch: the same tree renders for everyone, only
    // the animation props change, so no React #418. Count real
    // return statements, not comment text (the fix-10 comment
    // above names the old branch pattern in prose).
    expect(list.split("return (").length - 1).toBe(1);
    expect(list).toContain("const reduce = usePrefersReducedMotion();");
    // Reduced: no entrance at all and a zero-length tween.
    expect(list).toContain("initial={reduce ? false : { opacity: 0, y: 12 }}");
    expect(list).toContain("transition={reduce ? { duration: 0, delay: 0 }");
    // Normal motion keeps the original fade with stagger.
    expect(list).toContain("delay: i * 0.06, duration: 0.35");
  });

  it("AnimatedList rows are visible from the first paint under reduced motion (PR #154 P2)", () => {
    const list = component(file, "AnimatedList", "Orb");
    // The JS hook cannot cover the initial load: it returns false
    // until its effect runs, so rows mount with the opacity-zero
    // entrance. Each row therefore carries a class the CSS below
    // can force visible before JS runs at all.
    expect(list).toContain('className="animated-list-item"');
    // CSS layer in globals.css: !important beats Motion's inline
    // opacity: 0 / translateY, and the stylesheet loads before
    // first paint, so no flash and no fade on initial load.
    const css = src("src/app/globals.css");
    const reduceBlock = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduceBlock).toContain(".animated-list-item {");
    expect(reduceBlock).toContain("opacity: 1 !important;");
    expect(reduceBlock).toContain("transform: none !important;");
  });

  it("Orb reacts to a mid-session reduced-motion change", () => {
    const orb = component(file, "Orb", "PageTransition");
    // No one-time mount check any more.
    expect(orb).not.toContain("if (isReducedMotion()) return;");
    expect(orb).toContain("const reduce = usePrefersReducedMotion();");
    // The effect re-runs when the preference flips.
    expect(orb).toContain("}, [reduce]);");
    // Enabling reduced motion parks both orbs at rest.
    expect(orb).toContain('ref.current?.style.setProperty("--orb-x", "0px");');
    expect(orb).toContain('ref.current?.style.setProperty("--orb-y", "0px");');
    // Disabling it re-attaches the pointer-follow.
    expect(orb).toContain('section.addEventListener("pointermove", onMove);');
  });
});
