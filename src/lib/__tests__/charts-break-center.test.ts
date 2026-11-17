/**
 * All-pages fix 10 (break the center, /charts): the charts
 * headings and intros are left-aligned, PR #123 Run B pattern.
 *
 * Before: 5 text-center uses in src/app/charts/ChartSections.tsx,
 * the count from the all-pages audit of 2026-11-17. The custom
 * SVG astro charts are real product UI, not placeholders; the
 * form itself was already a centered max-w-xl column and stays
 * one, the same call as the /reports birth form.
 * After: 5 left-aligned, 0 kept centered.
 *
 * Left-aligned (5): the ChartsIntro header block (the "Birth
 * Charts" eyebrow, the h1 "Cast a birth chart" via PageHeader,
 * and the intro all sit in one div, so left-aligning the div
 * left-aligns the h1 too; the h1 text and tag are unchanged, and
 * PageHeader's h1 carries no alignment class of its own, so no
 * inline style fights the class, unlike the /reading SplitText
 * h1), with mx-auto removed from both intro paragraphs so a
 * left-aligned block does not sit in a centered box; the
 * "Choose a system" label in both the reduced-motion button
 * row and the GlideSelect picker, with mx-auto removed from
 * the reduced-motion label; the per-system blurb under the
 * picker, with mx-auto removed; and the "Skip to the
 * plain-words interpretation" jump-link line above the chart
 * result, an intro line to the result section, not a caption
 * under a centered visual.
 *
 * Kept centered, not counted in the 5 (they use mx-auto /
 * justify-center, not text-center): the "How your inputs are
 * used" details panel keeps its mx-auto max-w-xl centered box
 * (a self-contained bordered panel, the same family as the
 * callout panels kept centered on /spreads; its text is
 * already text-left); the system picker column stays mx-auto
 * max-w-lg and the reduced-motion button row stays mx-auto
 * max-w-lg (the picker is the page's focal control, the same
 * call as the /reports segment control kept centered); the
 * birth form stays mx-auto max-w-xl (a form column, not text).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("break the center, /charts: headings and intros left-aligned", () => {
  it("header block is left-aligned: eyebrow, h1, intro", () => {
    const charts = src("src/app/charts/ChartSections.tsx");
    expect(charts).toContain('<div className="text-left">');
    // The h1 itself is rendered by PageHeader with no alignment
    // class, so it inherits the left-aligned div.
    expect(charts).toContain(
      '<PageHeader eyebrow="Birth Charts" title="Cast a birth chart" titleClassName="sm:text-6xl" />',
    );
    // A left-aligned line must not sit in a centered box.
    expect(charts).toContain('<p className="mt-4 max-w-xl text-cream/75">');
    expect(charts).not.toContain(
      '<p className="mx-auto mt-4 max-w-xl text-cream/75">',
    );
    expect(charts).toContain('<p className="mt-2 max-w-xl text-sm text-cream/80">');
    expect(charts).not.toContain(
      '<p className="mx-auto mt-2 max-w-xl text-sm text-cream/80">',
    );
    // The "How your inputs are used" details panel keeps its
    // centered box; it is a bordered panel, and its text is
    // already text-left.
    expect(charts).toContain(
      '<details className="mx-auto mt-4 max-w-xl rounded-2xl border border-gold/20 bg-panel/50 p-4 text-left text-sm leading-relaxed text-cream/75">',
    );
  });

  it("system picker labels and blurb are left-aligned, picker column stays centered", () => {
    const charts = src("src/app/charts/ChartSections.tsx");
    // Both "Choose a system" labels, reduced-motion buttons and
    // GlideSelect picker alike.
    expect(charts).toContain(
      '<p className="mt-8 max-w-lg text-left text-sm text-cream/75">Choose a system</p>',
    );
    expect(charts).not.toContain(
      '<p className="mx-auto mt-8 max-w-lg text-center text-sm text-cream/75">Choose a system</p>',
    );
    expect(charts).toContain(
      '<p className="text-left text-sm text-cream/75">Choose a system</p>',
    );
    expect(charts).not.toContain(
      '<p className="text-center text-sm text-cream/75">Choose a system</p>',
    );
    // The per-system blurb under the picker.
    expect(charts).toContain(
      '<p className="mt-3 max-w-lg text-left text-sm text-cream/75">{SYSTEM_BLURBS[system]}</p>',
    );
    expect(charts).not.toContain(
      '<p className="mx-auto mt-3 max-w-lg text-center text-sm text-cream/75">{SYSTEM_BLURBS[system]}</p>',
    );
    // The picker itself is the page's focal control, so its
    // column stays centered; only its label went left.
    expect(charts).toContain('<div className="mx-auto mt-8 max-w-lg">');
  });

  it("result skip-link line is left-aligned and no text-center use remains", () => {
    const charts = src("src/app/charts/ChartSections.tsx");
    expect(charts).toContain(
      '<p className="mb-4 text-left text-sm text-cream/80">',
    );
    expect(charts).not.toContain(
      '<p className="mb-4 text-center text-sm text-cream/80">',
    );
    expect(charts.match(/text-center/g) ?? []).toHaveLength(0);
  });
});
