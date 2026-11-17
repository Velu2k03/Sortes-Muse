/**
 * All-pages fix 7 (break the center, /intake/[slug]): the intake
 * headings and intros are left-aligned, PR #123 Run B pattern.
 *
 * Before: 11 text-center uses on the route, the count from the
 * all-pages audit of 2026-11-17 (7 in IntakeSteps, 4 in
 * IntakeFlow). After: 6 left-aligned, 5 kept centered with a
 * reason.
 *
 * The centering of three steps came from the step wrappers in
 * IntakeFlow.tsx, not from the steps themselves: CategoryStep,
 * ConfirmStep, and ImpressionStep carry no text-center class on
 * their eyebrow, h1, or intro, they inherit it from the
 * motion.div wrapper. Left-aligning the three wrappers
 * left-aligns those heading blocks. The two max-w-md blocks in
 * CategoryStep (the intro and the pending-question box) and the
 * intro in ImpressionStep lose their mx-auto, so a left-aligned
 * block does not sit in a centered box.
 *
 * Left-aligned (6): the three step wrappers in IntakeFlow.tsx
 * (category, confirm, impression), and the FormStep heading
 * block in IntakeSteps.tsx (the "Step 2 of 4" eyebrow, the h1
 * with the category name, the intro, and the "Start over"
 * block). The FormStep h1 keeps its tabIndex={-1} and
 * outline-none! (programmatic step-change focus, the trailing !
 * is load-bearing); only its alignment changes, and it is a
 * plain h1 element, not SplitText, so no inline textAlign
 * style fights the class.
 *
 * Kept centered (5): the SignInGate panel (a self-contained
 * bordered gate panel, centered text plus a centered CTA, the
 * same family as the GuestKeepNotice / ThreeCardNudge callout
 * panels kept on /reading), the "Reversed cards are shown
 * upside down." caption (a short caption directly under the
 * centered dealt-card row, the same call as the "Tap any card
 * to enlarge it" caption kept on /reading), the cost line
 * above the SlideCommit reveal control ("Free · your first
 * Quick Insight" / "1 Oracle · only charged when your reading
 * is ready", a caption for the page's focal control), the
 * ProcessingStage wait screen ("Creating your reading", a
 * transient loading state, the same call as the "Loading…"
 * line kept on /reading), and the "Checking your account…"
 * loading line in IntakeFlow.tsx.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("break the center, /intake/[slug]: headings and intros left-aligned", () => {
  it("step wrappers in IntakeFlow are left-aligned, loading line stays centered", () => {
    const flow = src("src/app/intake/[slug]/IntakeFlow.tsx");
    expect(flow).toContain('className="text-left"');
    expect(flow.match(/className="text-left"/g) ?? []).toHaveLength(3);
    expect(flow).not.toContain('className="text-center"');
    // The one remaining text-center is the transient loading line.
    expect(flow).toContain(
      '<output className="mt-16 block text-center text-cream/75">Checking your account…</output>',
    );
  });

  it("FormStep heading block is left-aligned, h1 focus handling untouched", () => {
    const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
    expect(steps).toContain(
      '<p className="text-left text-sm text-gold">\n        Step 2 of 4',
    );
    // The h1 keeps tabIndex={-1} and outline-none!; only its
    // alignment changes from text-center to text-left.
    expect(steps).toContain(
      '<h1 ref={headingRef} tabIndex={-1} className="mt-3 scroll-mt-32 text-left font-display text-4xl text-goldbright outline-none!">',
    );
    // A left-aligned block must not sit in a centered box.
    expect(steps).toContain(
      '<p className="mt-3 max-w-md text-left text-sm text-cream/75">',
    );
    expect(steps).not.toContain(
      '<p className="mx-auto mt-3 max-w-md text-center text-sm text-cream/75">',
    );
    expect(steps).toContain('<div className="mt-4 text-left">');
  });

  it("CategoryStep and ImpressionStep intros lose mx-auto, card caption stays centered", () => {
    const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
    expect(steps).toContain(
      '<p className="mt-3 max-w-md text-cream/75">',
    );
    expect(steps).toContain(
      '<p className="mt-4 max-w-md rounded-2xl border border-gold/25 bg-panel/60 p-4 text-sm text-cream/85">',
    );
    expect(steps).toContain(
      '<p className="mt-3 max-w-md text-sm text-cream/75">',
    );
    // The caption stays tied to the centered dealt-card row.
    expect(steps).toContain(
      '<p className="mt-4 text-center text-xs text-mist">\n        Reversed cards are shown upside down.',
    );
  });

  it("exactly 5 text-center uses remain, all kept blocks", () => {
    const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
    const flow = src("src/app/intake/[slug]/IntakeFlow.tsx");
    expect(steps.match(/text-center/g) ?? []).toHaveLength(4);
    expect(flow.match(/text-center/g) ?? []).toHaveLength(1);
    // SignInGate panel, card caption, cost line, wait screen.
    expect(steps).toContain('aria-label="Sign in required"');
    expect(steps).toContain("Reversed cards are shown upside down.");
    expect(steps).toContain("only charged when your reading is ready");
    expect(steps).toContain('aria-label="Creating your reading"');
  });
});
