import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Pricing Monthly/Annual sliding pill (transitions.dev
// 16-tabs-sliding, 2026-11-17): the gold pill slides between
// Monthly and Annual instead of the active button jumping its
// background. JS in PricingClient writes the active button's
// offsetLeft/offsetWidth onto the pill; CSS in globals.css owns
// the 250ms tween (--duration-fast, tabs sliding token, inside
// the site's 150-250ms band). Same labels, same prices, same
// savings, same URL sync (?billing=annual), same copy, same
// palette, same fonts. The buttons keep aria-pressed; the pill
// itself is aria-hidden.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("pricing toggle sliding pill", () => {
  it("renders a gold pill behind the toggle buttons, aria-hidden", () => {
    const c = src("src/components/PricingClient.tsx");
    expect(c).toContain(
      '<span ref={pillRef} aria-hidden="true" className="billing-toggle-pill" />',
    );
    // The pill is the first child of the toggle bar, so it sits
    // behind the buttons (z-0 pill, z-1 buttons). The bar hugs
    // the two buttons (width="fit-content" + mx-auto) instead
    // of stretching full-width, which only shows now that the
    // bar itself has a background.
    expect(c).toContain('width="fit-content"');
    expect(c).toContain(
      'className="relative mx-auto mt-8 rounded-full border border-gold/40 bg-panel p-1"',
    );
  });

  it("documents the raw-span exception and uses token-backed z-1 (PR #152, Codex P1)", () => {
    const c = src("src/components/PricingClient.tsx");
    // AGENTS.md self-check exception: the pill is deliberately
    // a raw <span> because no Astryx primitive fits a plain
    // decorative DOM node taking a ref and direct style writes.
    expect(c).toContain("AGENTS.md self-check exception");
    expect(c).toContain("No Astryx primitive fits it");
    // Buttons sit above the pill with the token-backed z-1
    // utility, never the arbitrary z-[1] value.
    expect(c).toContain("relative z-1 min-h-11");
    expect(c).not.toContain("z-[1]");
  });

  it("positions the pill from the active button's offsetLeft/offsetWidth", () => {
    const c = src("src/components/PricingClient.tsx");
    expect(c).toContain(
      "const tab = tabRefs.current[billing === \"monthly\" ? 0 : 1];",
    );
    expect(c).toContain("pill.style.transform = `translateX(${tab.offsetLeft}px)`;");
    expect(c).toContain("pill.style.width = `${tab.offsetWidth}px`;");
    expect(c).toContain("ref={(el) => {");
    expect(c).toContain("tabRefs.current[0] = el;");
    expect(c).toContain("tabRefs.current[1] = el;");
  });

  it("snaps the pill on first paint, resize, and font load, slides on toggle", () => {
    const c = src("src/components/PricingClient.tsx");
    // First paint without a transition, then reflow, then restore:
    // the snippet's guard against animating in from
    // translateX(0)/width 0.
    expect(c).toContain('pill.style.transition = "none";');
    expect(c).toContain("void pill.offsetWidth;");
    expect(c).toContain("pill.style.transition = prev;");
    expect(c).toContain("moveBillingPill(pillPositioned.current);");
    // Resize and webfont load re-measure without animating.
    expect(c).toContain('window.addEventListener("resize", snap);');
    expect(c).toContain("document.fonts?.ready.then(() => {");
    // Billing changes slide: the layout effect re-runs on billing
    // with the pill already positioned, so animate is true.
    expect(c).toContain("}, [billing, moveBillingPill]);");
  });

  it("the pill tween is 250ms with the smooth-out ease, inside the 150-250ms band", () => {
    const css = src("src/app/globals.css");
    expect(css).toContain(".billing-toggle-pill {");
    expect(css).toContain("background: var(--color-gold);");
    expect(css).toContain("transform 250ms cubic-bezier(0.22, 1, 0.36, 1),");
    expect(css).toContain("width 250ms cubic-bezier(0.22, 1, 0.36, 1);");
    expect(css).toContain("will-change: transform, width;");
    expect(css).toContain("pointer-events: none;");
  });

  it("reduced motion snaps the pill: the global reduce block zeroes transitions", () => {
    const css = src("src/app/globals.css");
    expect(css).toContain("@media (prefers-reduced-motion: reduce) {");
    expect(css).toContain("transition-duration: 0.01ms !important;");
  });

  it("the buttons no longer own the gold background, only text colour", () => {
    const c = src("src/components/PricingClient.tsx");
    expect(c).not.toContain('"border-gold bg-gold text-ink"');
    expect(c).not.toContain('"border-gold/40 bg-panel text-cream"');
    expect(c).toContain('billing === "monthly" ? "text-ink" : "text-cream"');
    expect(c).toContain('billing === "annual" ? "text-ink" : "text-cream"');
  });

  it("toggle semantics and URL sync are untouched", () => {
    const c = src("src/components/PricingClient.tsx");
    expect(c).toContain('aria-pressed={billing === "monthly"}');
    expect(c).toContain('aria-pressed={billing === "annual"}');
    expect(c).toContain('onClick={() => syncBilling("monthly")}');
    expect(c).toContain('onClick={() => syncBilling("annual")}');
    // PR #152 fix: the URL is written with history.replaceState,
    // not router.replace (a router navigation re-rendered the page
    // mid-toggle and the searchParams effect flipped billing back
    // to Monthly, so the pill flickered instead of sliding).
    expect(c).toContain('"?billing=annual"');
    expect(c).toContain('window.history.replaceState(null, "", `/pricing${qs}`);');
    expect(c).not.toContain("router.replace(");
  });

  it("the pill really slides: no snap fires on toggle, no navigation flicker (PR #152 fix)", () => {
    const c = src("src/components/PricingClient.tsx");
    // The resize/fonts snap subscribes ONCE on mount through a
    // ref to the latest moveBillingPill. It used to depend on
    // moveBillingPill, so it re-ran on every billing change and
    // its .ready snap fired as a microtask right after the toggle
    // commit, setting transition: none + reflow and cancelling
    // the in-flight 250ms slide, so the pill jumped.
    expect(c).toContain("const moveBillingPillRef = useRef(moveBillingPill);");
    expect(c).toContain("moveBillingPillRef.current = moveBillingPill;");
    expect(c).toContain("const snap = () => moveBillingPillRef.current(false);");
    // The toggle writes the URL with replaceState and no router
    // navigation, so the searchParams effect never reads a stale
    // param mid-toggle. Back/forward still navigates, so that
    // effect still corrects billing then.
    expect(c).toContain('if (next !== billing) queueMicrotask(() => setBilling(next))');
  });
});
