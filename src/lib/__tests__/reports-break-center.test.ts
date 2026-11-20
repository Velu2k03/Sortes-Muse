/**
 * All-pages fix 4 (break the center, /reports): the /reports
 * headings and intros are left-aligned, PR #123 Run B pattern.
 *
 * Before: 10 text-center uses in ReportsClient.tsx, the highest
 * count of any page in the all-pages audit of 2026-11-17.
 * After: 7 left-aligned, 3 kept centered with a reason.
 *
 * Left-aligned (7): the h1 "Your astrology reports", the intro
 * lines (1 Oracle per report, delivery format, privacy note),
 * the Oracle balance line, the type blurb, and the comparison
 * note. The delivery-format paragraph also lost its mx-auto:
 * a left-aligned block must not sit in a centered box.
 *
 * Kept centered (3): the three full-width status/alert boxes
 * (out of Oracles, error, signed-out). Centered text inside a
 * bordered alert box is the site's existing alert pattern:
 * AccountDeletedNotice and PurchaseConfirmer use text-center in
 * the same kind of box, and PricingClient centers its error
 * line. They are alerts, not headings or intros, so they stay.
 *
 * Also kept centered, not counted here: the RubberSegment type
 * selector (the page's single focal control), the "Writing your
 * report…" status row, and the CallChip row. Those are centered
 * controls/status under a full-width button, not text blocks.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("break the center, /reports: headings and intros left-aligned", () => {
  it("h1 and intro lines are left-aligned, no text-center on them", () => {
    const client = src("src/app/reports/ReportsClient.tsx");
    expect(client).toContain(
      '<h1 className="mt-2 text-left font-display text-5xl text-goldbright">Your astrology reports</h1>',
    );
    expect(client).toContain('<p className="mt-3 text-left text-cream/80">');
    expect(client).toContain(
      '<p className="mt-2 max-w-xl text-left text-sm text-mist">',
    );
    expect(client).toContain('<p className="mt-2 text-left text-sm text-mist">');
    expect(client).toContain('<p className="mt-4 text-left text-sm text-cream">');
    expect(client).toContain(
      '<p className="mt-3 text-left text-sm text-cream/75">{TYPE_BLURBS[type]}</p>',
    );
    expect(client).toContain(
      '<p className="mt-2 text-left text-sm text-mist">\n          You enter both charts.',
    );
    // The delivery-format paragraph must not sit in a centered box.
    expect(client).not.toContain(
      '<p className="mx-auto mt-2 max-w-xl text-center text-sm text-mist">',
    );
  });

  it("exactly 3 text-center uses remain, all three alert boxes", () => {
    const client = src("src/app/reports/ReportsClient.tsx");
    const centered = client.match(/text-center/g) ?? [];
    expect(centered.length).toBe(3);
    expect(client).toContain(
      '<div className="mt-6 rounded-2xl border border-gold/25 bg-panel/70 p-4 text-center text-sm text-cream">\n          You do not have enough credits.',
    );
    expect(client).toContain(
      '<div className="mt-6 rounded-2xl border border-danger/40 bg-panel/70 p-4 text-center text-sm text-danger">',
    );
    expect(client).toContain(
      '<div className="mt-6 rounded-2xl border border-gold/25 bg-panel/70 p-4 text-center text-sm text-cream">\n          Reports need an account so they are saved to it.',
    );
  });
});
