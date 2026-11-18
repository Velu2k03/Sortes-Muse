/**
 * All-pages fix 9 (break the center, /journal): the journal
 * headings and intro are left-aligned, PR #123 Run B pattern.
 *
 * Before: 5 text-center uses in src/app/journal/HistoryClient.tsx,
 * the count from the all-pages audit of 2026-11-17. The timeline
 * itself was already left-aligned; the centering lived in the
 * header block, the loading line, the empty-state box, the delete
 * error line, and the no-match search line.
 * After: 1 left-aligned, 4 kept centered with a reason.
 *
 * Left-aligned (1): the header block (the "Journal" eyebrow, the
 * h1 "Your readings" via PageHeader, and the intro all sit in one
 * div, so left-aligning the div left-aligns the h1 too; the h1
 * text and tag are unchanged, and PageHeader's h1 carries no
 * alignment class of its own, so no inline style fights the
 * class, unlike the /reading SplitText h1), with mx-auto removed
 * from the intro paragraph so a left-aligned block does not sit
 * in a centered box.
 *
 * Kept centered (4): the "Loading your journal…" line, a
 * transient loading state, the same call as the "Loading…" line
 * kept on /reading; the "No readings yet" empty-state box
 * (bordered panel plus a centered CTA, the same family as the
 * alert boxes kept centered on /reports and the "No cards match"
 * empty states kept on /deck); the delete error line, an alert
 * line, the same family as the error box kept on /reports; and
 * the "No readings match that search" line, an empty state, the
 * same call as the /deck empty states.
 *
 * Heirloom-title CHECK, from the audit: the h1 "Sortes journal"
 * with class heirloom-title (HistoryClient.tsx:581) lives inside
 * the .journal-print-sheet, which is display: none on screen and
 * only shows in print (globals.css). Its only CSS rule is inside
 * @media print, where it inherits Cinzel (the display face since
 * Fonts F2, 2026-11-19) from the print sheet's font-family
 * (globals.css), so it is Cinzel in print, not a third font, and
 * it is not the visible
 * page h1 at all. No change needed, and this branch does not
 * touch it.
 *
 * Virtualization CHECK, from the audit: the main timeline renders
 * groupReadingsByDay(filteredHistory).map with every reading
 * mapped, no slice, cap, or pagination on the main list (only
 * slice(0,3) is for the repeated-questions summary and slice(0,5)
 * is for card thumbnails). It needs the same Virtuoso /
 * content-visibility treatment as /deck once history passes 50
 * items. Not fixed in this branch, it is its own one-by-one fix.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("break the center, /journal: headings and intro left-aligned", () => {
  it("header block is left-aligned: eyebrow, h1, intro", () => {
    const journal = src("src/app/journal/HistoryClient.tsx");
    expect(journal).toContain('<div className="text-left">');
    // The h1 itself is rendered by PageHeader with no alignment
    // class, so it inherits the left-aligned div.
    expect(journal).toContain(
      '<PageHeader eyebrow="Journal" title="Your readings" titleClassName="sm:text-6xl" />',
    );
    // A left-aligned line must not sit in a centered box.
    expect(journal).toContain('<p className="mt-4 max-w-xl text-cream/75">');
    expect(journal).not.toContain(
      '<p className="mx-auto mt-4 max-w-xl text-cream/75">',
    );
  });

  it("heirloom-title h1 is print-only Cinzel, untouched", () => {
    const journal = src("src/app/journal/HistoryClient.tsx");
    expect(journal).toContain('<h1 className="heirloom-title">Sortes journal</h1>');
    // The print sheet is hidden on screen; the h1 stays inside it.
    expect(journal).toContain('<div className="journal-print-sheet">');
    const css = src("src/app/globals.css");
    // The only heirloom-title rule is inside @media print, where
    // it inherits Cinzel from the print sheet.
    expect(css).toContain(
      'font-family: "Cinzel", "Times New Roman", Georgia, serif;',
    );
  });

  it("exactly 4 text-center uses remain: loading, empty state, delete error, no-match line", () => {
    const journal = src("src/app/journal/HistoryClient.tsx");
    expect(journal.match(/text-center/g) ?? []).toHaveLength(4);
    // Transient loading state, same call as /reading.
    expect(journal).toContain(
      '<p className="py-16 text-center text-mist">Loading your journal…</p>',
    );
    // Empty-state box, bordered panel plus a centered CTA.
    expect(journal).toContain(
      '<div className="mx-auto mt-12 max-w-md rounded-3xl border border-gold/20 bg-panel/60 p-8 text-center">',
    );
    // Delete error line, an alert line.
    expect(journal).toContain(
      '<p className="mt-6 text-center text-sm text-danger">',
    );
    // No-match search line, an empty state.
    expect(journal).toContain(
      '<p className="mt-8 text-center text-sm text-mist">No readings match that search. Try a different word, or clear the search.</p>',
    );
  });
});
