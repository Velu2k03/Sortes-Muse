/**
 * All-pages fix 10 (browser-verify the CHECK items): every CHECK
 * from the 2026-11-17 all-pages audit was probed in a production
 * build with Playwright, at 1280px and 390px, before this branch
 * changed anything. Most were already correct in code, and this
 * test locks them so a future grep does not re-flag them. Two
 * were actually broken and are fixed here: the FAQ summary had no
 * aria-expanded and no chevron, and PageTransition / AnimatedList /
 * Orb branched on useReducedMotion in render, which threw a React
 * #418 hydration error on EVERY page for reduced-motion users
 * (the server cannot see prefers-reduced-motion, so it rendered
 * the motion wrapper while the client rendered a fragment).
 *
 * Browser results, production build, ports 3121-3122:
 * - Skip link: first Tab stop, visible on focus (absolute, 40px),
 *   Enter moves focus to #main-content.
 * - /daily hold: holding Space 1.5s draws the card; a 200ms press
 *   does not draw.
 * - IntakeSteps: the step h1 is document.activeElement on load
 *   and after a category pick (top 245px, in view), with no focus
 *   ring (outline none / 3px).
 * - FAQ: group h2s present; summary toggles on Enter in ~106ms;
 *   aria-expanded was ABSENT and there was NO chevron (fixed).
 * - Charts unknownTime + showGlosses, reports unknownTime: all
 *   label-wrapped; clicking the label text toggles the box, and
 *   the time / hour inputs disable / hide. Vedic "Gochara date",
 *   Western "Transit date", Ziwei "Stack year" date/number inputs
 *   all carry aria-labels (verified after example + calculate,
 *   with a gender picked for Ziwei, which needs one).
 * - Reading follow-up inputs: "Follow-up question" (renders only
 *   when aiGenerated + interpretation, no chartSummary),
 *   "My next step", "Note on this reading", "Revisit note" all
 *   carry aria-labels; the follow-up input accepts text.
 * - Contact: real mailto: link (support@resonantatlas.com).
 * - React #418: fired on all 16 probed pages under
 *   prefers-reduced-motion: reduce, and on none with normal
 *   motion. After the ReactBitsNew fix it fires on none.
 * - No horizontal overflow on /, /daily, /faq, /charts, /reports,
 *   /contact at 1280px, or /daily, /faq, /charts at 390px. Zero
 *   console errors on the probed pages with normal motion.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("browser-verify CHECK items: flagged input labels", () => {
  it("charts unknownTime checkbox is label-wrapped, not bare", () => {
    const sections = src("src/app/charts/ChartSections.tsx");
    // The checkbox sits inside its <label> with the visible text,
    // which is why get_by_label("I do not know the birth time")
    // finds it and clicking the label text toggles it.
    expect(sections).toContain('<label className="flex items-center gap-2 text-sm text-cream/80">');
    expect(sections).toContain("I do not know the birth time");
    expect(sections).toContain('checked={unknownTime}');
  });

  it("charts showGlosses checkbox is label-wrapped, not bare", () => {
    const sections = src("src/app/charts/ChartSections.tsx");
    expect(sections).toContain("Show Chinese glosses (default off in English, on in Chinese)");
    expect(sections).toContain("checked={showGlosses}");
  });

  it("reports unknownTime checkbox is label-wrapped, not bare", () => {
    const reports = src("src/app/reports/ReportsClient.tsx");
    expect(reports).toContain("Birth time unknown");
    expect(reports).toContain("checked={value.unknownTime}");
  });

  it("transit date/number inputs carry aria-labels", () => {
    expect(src("src/components/VedicTransits.tsx")).toContain('aria-label="Gochara date"');
    expect(src("src/components/WesternTransits.tsx")).toContain('aria-label="Transit date"');
    expect(src("src/components/ZiweiStacks.tsx")).toContain('aria-label="Stack year"');
  });

  it("reading follow-up inputs carry aria-labels", () => {
    const sections = src("src/app/reading/[id]/ReadingSections.tsx");
    // The follow-up input renders only when the reading is
    // aiGenerated with an interpretation and no chartSummary
    // (ReadingDetailClient hasFollowUpThread); the probe seeds
    // such a reading before checking get_by_label.
    expect(sections).toContain('aria-label="Follow-up question"');
    expect(sections).toContain('aria-label="My next step"');
    expect(sections).toContain('aria-label="Note on this reading"');
    expect(sections).toContain('aria-label="Revisit note"');
  });
});

describe("browser-verify CHECK items: skip link, daily hold, intake focus", () => {
  it("skip link is first in tab order and targets #main-content", () => {
    const layout = src("src/app/layout.tsx");
    expect(layout).toContain('href="#main-content"');
    expect(layout).toContain("Skip to main content");
    expect(layout).toContain('id="main-content"');
  });

  it("/daily HoldCard has a keyboard hold: Space/Enter hold, Escape cancels", () => {
    const hold = src("src/components/HoldCard.tsx");
    expect(hold).toContain('aria-label="Hold to draw today\'s card"');
    expect(hold).toContain('e.key === " " || e.key === "Enter"');
    expect(hold).toContain('if (e.key === "Escape")');
    // A tap never draws: only a completed hold fires onHold.
    expect(hold).toContain("A tap never draws");
  });

  it("IntakeSteps moves focus to the step h1 on mount, with no focus ring", () => {
    const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
    expect(steps).toContain("el.focus({ preventScroll: true })");
    expect(steps).toContain("tabIndex={-1}");
    expect(steps).toContain("outline-none!");
  });
});

describe("browser-verify CHECK items: FAQ accordion", () => {
  it("FAQ group headings are h2s", () => {
    const faq = src("src/components/FaqList.tsx");
    // Gold rationing (Velu 2026-11-18): FAQ group h2s are cream.
    expect(faq).toContain('<h2 className="font-display text-3xl text-cream">{g.name}</h2>');
  });

  it("FAQ summary carries aria-expanded synced by onToggle, and a chevron that flips", () => {
    const faq = src("src/components/FaqList.tsx");
    // Fixed in this branch: the native <summary> had no
    // aria-expanded in the DOM and no visual affordance at all.
    // onToggle fires on every open change, including Expand all /
    // Collapse all and the hash opener, which set el.open
    // directly, so the mirrored state cannot go stale.
    expect(faq).toContain("aria-expanded={open}");
    expect(faq).toContain("onToggle={(e) => setOpen(e.currentTarget.open)}");
    expect(faq).toContain("transition-transform duration-200");
    expect(faq).toContain('"rotate-180"');
  });
});

describe("browser-verify CHECK items: contact action, hydration", () => {
  it("contact uses a real mailto link, not a div with onClick", () => {
    const contact = src("src/app/contact/page.tsx");
    expect(contact).toContain("href={`mailto:${CONTACT_EMAIL}`}");
  });

  it("no render branch on useReducedMotion in ReactBitsNew: one tree server and client", () => {
    const bits = src("src/components/ReactBitsNew.tsx");
    // Fixed in this branch: PageTransition, AnimatedList and Orb
    // each returned a different tree when useReducedMotion() was
    // true, and the server always renders the motion branch, so
    // reduced-motion users got React #418 on every page.
    // MotionConfig reducedMotion="user" already makes the motion
    // instant for them, so the branches were redundant.
    // (The explanatory comments in ReactBitsNew quote the old
    // branch, so this asserts on code lines only, not comments.)
    expect(bits).not.toContain("useReducedMotion()");
    expect(bits).not.toMatch(/^\s+if \(reduce\) return /m);
    expect(src("src/components/MotionProvider.tsx")).toContain('reducedMotion="user"');
  });
});
