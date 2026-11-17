/**
 * All-pages fix 6 (break the center, /deck): the deck headings
 * and intros are left-aligned, PR #123 Run B pattern.
 *
 * Before: 8 text-center uses in src/app/deck/DeckClient.tsx,
 * the count from the all-pages audit of 2026-11-17.
 * After: 5 left-aligned, 3 kept centered with a reason.
 *
 * Left-aligned (5): the header block (the "The deck" eyebrow,
 * the h1, the intro, and the "Draw today's card" link all sit
 * in one div, so left-aligning the div left-aligns the h1 too;
 * the h1 text and tag are unchanged, and unlike the /reading
 * h1 it is a plain h1 element, not SplitText, so no inline
 * textAlign style fights the class), the intro also loses its
 * mx-auto (a left-aligned block must not sit in a centered
 * box), the card-count status line in the toolbar, the two
 * spiral instruction lines above the gallery, and the card
 * imagery attribution footnote at the bottom (a footnote, the
 * same call as the /reading disclaimer footnote, which was
 * left-aligned in fix 5).
 *
 * The toolbar controls themselves (search, filter pills, view
 * toggle) stay centered in their flex row with justify-center:
 * they are controls, not text, the same call as the /reports
 * segment control kept centered in fix 4. The spiral gallery
 * itself stays a centered visual, the page's focal moment.
 *
 * Kept centered (3): the three identical "No cards match…"
 * empty states, one per view (spiral, list, grid). An empty
 * state is a transient state, not a page heading or body
 * intro: centered message plus a centered Reset filters
 * button, the same family as the alert boxes kept centered
 * on /reports and the "Reading not found" error view kept
 * centered on /reading.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("break the center, /deck: headings and intros left-aligned", () => {
  it("header block is left-aligned: eyebrow, h1, intro, draw link", () => {
    const deck = src("src/app/deck/DeckClient.tsx");
    expect(deck).toContain('<div className="text-left">');
    expect(deck).toContain(
      '<h1 className="mt-2 font-display text-4xl text-goldbright sm:text-5xl">',
    );
    // A left-aligned line must not sit in a centered box.
    expect(deck).toContain(
      '<p className="mt-3 max-w-xl text-left text-sm text-cream/75">',
    );
    expect(deck).not.toContain(
      '<p className="mx-auto mt-3 max-w-xl text-sm text-cream/75">',
    );
  });

  it("count line, spiral instructions, and attribution footnote are left-aligned", () => {
    const deck = src("src/app/deck/DeckClient.tsx");
    expect(deck).toContain(
      '<p className="w-full text-left text-xs text-mist sm:w-auto" aria-live="polite">',
    );
    expect(deck).toContain(
      '<p className="mb-3 text-left text-sm text-mist">Spiral is a visual browse. To browse cards by keyboard, switch to List above.</p>',
    );
    expect(deck).toContain(
      '<p className="text-left text-sm text-cream/75">',
    );
    expect(deck).toContain(
      '<p className="mt-10 text-left text-xs text-mist">',
    );
  });

  it("exactly 3 text-center uses remain: the three empty states", () => {
    const deck = src("src/app/deck/DeckClient.tsx");
    expect(deck.match(/text-center/g) ?? []).toHaveLength(3);
    // All three kept blocks are the identical "No cards match"
    // empty state, one per view, message plus Reset button.
    expect(deck.match(/No cards match \{query\.trim\(\)/g) ?? []).toHaveLength(3);
    expect(deck).toContain('Reset filters');
  });
});
