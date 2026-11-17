/**
 * All-pages fix 8 (break the center, /spreads): the spread
 * headings and intros are left-aligned, PR #123 Run B pattern.
 *
 * Before: 6 text-center uses in src/app/spreads/SpreadsClient.tsx,
 * the count from the all-pages audit of 2026-11-17. The spread
 * rows themselves were already left-aligned (h2s left, SpreadsClient
 * line 170 in the audit tree); the centering lived in the header
 * block, one text link, two button labels, and two callout panels.
 * After: 2 left-aligned, 4 kept centered with a reason.
 *
 * Left-aligned (2): the header block (the "Readings" eyebrow, the
 * h1 "Choose your spread" via PageHeader, the intro, and the
 * reflection disclaimer all sit in one div, so left-aligning the
 * div left-aligns the h1 too; the h1 text and tag are unchanged,
 * and PageHeader's h1 carries no alignment class of its own, so
 * no inline style fights the class), with mx-auto removed from
 * both intro paragraphs so a left-aligned block does not sit in
 * a centered box; and the "View spread detail" text link under a
 * locked card, a plain text link in otherwise left-aligned card
 * content, not a button.
 *
 * Kept centered (4): the free banner panel ("Start here, it is
 * free", bordered panel plus a centered CTA, the same family as
 * the GuestKeepNotice / ThreeCardNudge panels kept on /reading
 * and the SignInGate panel kept on /intake) and the Oracles
 * footer panel ("Oracles", bordered panel plus a centered CTA,
 * same family); and the two button labels, "Get Oracles to
 * begin" and "Begin reading", where text-center centers the
 * label inside the button, not a text block. Buttons are
 * controls, not text, the same call as the toolbar controls
 * kept centered on /deck.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("break the center, /spreads: headings and intros left-aligned", () => {
  it("header block is left-aligned: eyebrow, h1, intro, disclaimer", () => {
    const spreads = src("src/app/spreads/SpreadsClient.tsx");
    expect(spreads).toContain('<div className="text-left">');
    // The h1 itself is rendered by PageHeader with no alignment
    // class, so it inherits the left-aligned div.
    expect(spreads).toContain(
      '<PageHeader eyebrow="Readings" title="Choose your spread"',
    );
    // A left-aligned line must not sit in a centered box.
    expect(spreads).toContain(
      '<p className="mt-4 max-w-xl text-cream/75">',
    );
    expect(spreads).toContain(
      '<p className="mt-3 max-w-xl text-xs italic text-mist">',
    );
    expect(spreads).not.toContain(
      '<p className="mx-auto mt-4 max-w-xl text-cream/75">',
    );
    expect(spreads).not.toContain(
      '<p className="mx-auto mt-3 max-w-xl text-xs italic text-mist">',
    );
  });

  it("View spread detail link is left-aligned, button labels stay centered", () => {
    const spreads = src("src/app/spreads/SpreadsClient.tsx");
    expect(spreads).toContain(
      'className="mt-3 block text-left text-sm font-semibold text-goldbright underline underline-offset-4"',
    );
    expect(spreads).not.toContain(
      'className="mt-3 block text-center text-sm font-semibold text-goldbright underline underline-offset-4"',
    );
    // Button labels: text-center centers the label inside the
    // button, it is not a centered text block.
    expect(spreads).toContain("Get Oracles to begin");
    expect(spreads).toContain(
      'className="btn-ghost mt-4 rounded-xl border border-gold/30 px-4 py-3 text-center font-semibold"',
    );
    expect(spreads).toContain(
      'className="btn-ghost mt-4 block rounded-xl border border-gold/30 px-4 py-3 text-center font-semibold"',
    );
  });

  it("exactly 4 text-center uses remain: two callout panels, two button labels", () => {
    const spreads = src("src/app/spreads/SpreadsClient.tsx");
    expect(spreads.match(/text-center/g) ?? []).toHaveLength(4);
    // The two kept panels are the free banner and the Oracles footer.
    expect(spreads).toContain("Start here, it is free");
    expect(spreads).toContain(
      '<div className="mx-auto mt-8 max-w-2xl rounded-3xl border border-gold/25 bg-panel/60 p-6 text-center">',
    );
    expect(spreads).toContain(
      '<div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-gold/20 bg-panel/50 p-6 text-center">',
    );
  });
});
