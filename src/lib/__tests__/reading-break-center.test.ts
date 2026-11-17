/**
 * All-pages fix 5 (break the center, /reading/[id]): the reading
 * headings and intros are left-aligned, PR #123 Run B pattern.
 *
 * Before: 14 text-center uses on the route, the second-highest
 * count of any page in the all-pages audit of 2026-11-17:
 * 8 in ReadingSections.tsx, 6 in ReadingDetailClient.tsx.
 * After: 9 left-aligned, 5 kept centered with a reason.
 *
 * Left-aligned (9): in ReadingSections, the header block, the
 * spread/date line, the h1 "Your reading" (text and tag
 * unchanged, only its alignment), the question, the original
 * question, and the first impression. The h1 needs
 * textAlign="left" as a prop, not just the text-left class:
 * SplitText applies textAlign as an inline style, default
 * "center", which beats the class; the class alone does not
 * move it. In ReadingDetailClient,
 * the privacy note, the "Ask more" panel, the "Keep and share"
 * panel, and the disclaimer footnote. The two action panels
 * also move items-center to items-start, so a left-aligned
 * block does not sit in a centered column; this matches the
 * page's own form panels (NextStep, Note, Revisit), which are
 * already text-left. A left-aligned line also loses its mx-auto:
 * a left-aligned block must not sit in a centered box.
 *
 * Kept centered (5): in ReadingSections, the two bordered
 * notice/callout panels (GuestKeepNotice "Keep this reading",
 * ThreeCardNudge "Go deeper with three cards") and the "Tap any
 * card to enlarge it" caption. The panels are self-contained
 * callouts, centered text plus a centered CTA is the site's
 * existing callout pattern, the same family as the alert boxes
 * kept centered on /reports; they are not page headings or body
 * intros. The caption sits directly under the centered card
 * row, the dealt cards are the page's focal moment, so the
 * caption stays tied to the row it describes. In
 * ReadingDetailClient, the "Loading…" line (a transient state,
 * one line) and the "Reading not found" error view (an error
 * page, centered is the pattern here, same as /offline and
 * not-found).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("break the center, /reading/[id]: headings and intros left-aligned", () => {
  it("header block is left-aligned: spread line, h1, question lines", () => {
    const sections = src("src/app/reading/[id]/ReadingSections.tsx");
    expect(sections).toContain(
      '<p className="num text-left text-sm text-gold">',
    );
    expect(sections).toContain(
      'tag="h1" text="Your reading" className="mt-3 text-left font-display text-5xl text-goldbright" textAlign="left"',
    );
    // SplitText applies textAlign as an inline style, default
    // "center", which beats the text-left class. The prop above
    // is what actually moves the h1; the class alone does not.
    expect(sections).toContain(
      '<p className="mt-4 max-w-xl text-left italic text-cream/80">',
    );
    expect(sections).toContain(
      '<p className="mt-2 max-w-xl text-left text-xs text-mist">',
    );
    expect(sections).toContain(
      '<p className="mt-2 max-w-xl text-left text-sm text-goldbright">',
    );
    // A left-aligned line must not sit in a centered box.
    expect(sections).not.toContain(
      '<p className="mx-auto mt-4 max-w-xl text-center italic text-cream/80">',
    );
  });

  it("privacy note, action panels, and disclaimer are left-aligned", () => {
    const client = src("src/app/reading/[id]/ReadingDetailClient.tsx");
    expect(client).toContain(
      '<p className="mt-10 max-w-3xl text-left text-sm text-mist">',
    );
    expect(client).toContain(
      '<section aria-label="Ask more" className="mx-auto mt-10 flex max-w-3xl flex-col items-start gap-4 rounded-3xl border border-gold/25 bg-panel/60 p-6 text-left sm:p-8">',
    );
    expect(client).toContain(
      '<section aria-label="Keep and share" className="mx-auto mt-6 flex max-w-3xl flex-col items-start gap-4 rounded-3xl border border-gold/25 bg-panel/60 p-6 text-left sm:p-8">',
    );
    expect(client).toContain(
      '<p className="mt-8 max-w-md text-left text-xs italic leading-relaxed text-mist">',
    );
  });

  it("exactly 5 text-center uses remain: 3 in ReadingSections, 2 in ReadingDetailClient", () => {
    const sections = src("src/app/reading/[id]/ReadingSections.tsx");
    const client = src("src/app/reading/[id]/ReadingDetailClient.tsx");
    expect(sections.match(/text-center/g) ?? []).toHaveLength(3);
    expect(client.match(/text-center/g) ?? []).toHaveLength(2);
    // The two kept panels are the bordered notice/callout boxes.
    expect(sections).toContain(
      '<h2 className="font-display text-xl text-goldbright">Keep this reading</h2>',
    );
    expect(sections).toContain(
      '<h2 className="font-display text-xl text-goldbright">Go deeper with three cards</h2>',
    );
    // The kept caption sits under the centered card row.
    expect(sections).toContain(
      '<p className="mt-3 text-center text-xs text-mist">\n        Tap any card to enlarge it.',
    );
    // The kept client lines are the transient and error states.
    expect(client).toContain(
      '<p className="py-20 text-center text-mist">Loading…</p>',
    );
    expect(client).toContain(
      '<h1 className="font-display text-4xl text-goldbright">Reading not found</h1>',
    );
  });
});
