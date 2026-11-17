/**
 * All-pages fix 3 (missing h1s): /charts, the normal /reading/[id]
 * view, and /spreads/[slug] each have exactly one h1.
 *
 * Finding: the all-pages audit of 2026-11-17 reported all three
 * routes as having no h1. That was wrong, and it was wrong at the
 * audit's own base (57deead) as well as at 1816428: the audit's
 * crude grep missed h1s rendered through shared components. No
 * page code is changed by this fix; this test locks the real h1
 * chain per route so the finding stays closed.
 *
 * - /charts: ChartsIntro renders PageHeader with title
 *   "Cast a birth chart", and PageHeader renders one <h1>.
 * - /reading/[id]: the normal view renders ReadingHeader, which
 *   renders SplitText tag="h1" text="Your reading". SplitText
 *   renders its tag prop as the element, so that is a real h1.
 *   The only literal <h1> on the route, "Reading not found",
 *   lives in the null branch, which returns early, so the two
 *   h1s are mutually exclusive: exactly one h1 in either view.
 *   One more h1 exists in the DOM of the normal view, inside
 *   HeirloomPrint, but it is the print-only keepsake sheet:
 *   display:none on screen (globals.css) and aria-hidden, shown
 *   only by the print stylesheet as the printed document's own
 *   title. It is not a second screen h1, and changing it would
 *   weaken the printed keepsake, so it stays.
 * - /spreads/[slug]: ReadingFlow renders GateScreen
 *   unconditionally, and GateScreen renders one <h1> with the
 *   spread name. That is the only <h1> in ReadingFlow.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

function h1Count(source: string): number {
  return (source.match(/<h1( |>|$)/g) ?? []).length;
}

describe("missing h1s: one h1 per route, /charts, /reading/[id], /spreads/[slug]", () => {
  it("/charts has exactly one h1: PageHeader, 'Cast a birth chart'", () => {
    const page = src("src/app/charts/page.tsx");
    const client = src("src/app/charts/ChartsClient.tsx");
    const sections = src("src/app/charts/ChartSections.tsx");
    const header = src("src/components/PageHeader.tsx");
    // No literal h1 in the charts files themselves; the h1 comes
    // from the shared PageHeader, which is why the audit missed it.
    expect(h1Count(page)).toBe(0);
    expect(h1Count(client)).toBe(0);
    expect(h1Count(sections)).toBe(0);
    expect(h1Count(header)).toBe(1);
    // The intro is the page header, with the page title.
    expect(sections).toContain('title="Cast a birth chart"');
    expect(sections).toContain("PageHeader");
    expect(client).toContain("<ChartsIntro />");
    // PageHeader renders its title inside the one h1.
    expect(header).toContain("{title}");
    expect(header).toContain("font-display text-5xl text-goldbright");
  });

  it("/reading/[id] normal view has exactly one screen h1: 'Your reading'", () => {
    const detail = src("src/app/reading/[id]/ReadingDetailClient.tsx");
    const sections = src("src/app/reading/[id]/ReadingSections.tsx");
    const split = src("src/components/SplitText.tsx");
    const heirloom = src("src/components/HeirloomPrint.tsx");
    const css = src("src/app/globals.css");
    // The normal view renders ReadingHeader after the loading and
    // not-found early returns, so it is the only h1 in that view.
    expect(detail).toContain("<ReadingHeader reading={reading} />");
    expect(sections).toContain('tag="h1"');
    expect(sections).toContain('text="Your reading"');
    // SplitText renders its tag prop as the element, so tag="h1"
    // is a real h1, not a class name.
    expect(split).toContain("const Tag = tag || 'p'");
    expect(split).toContain("<Tag");
    // The only literal <h1> on the route is "Reading not found",
    // in the null branch, which returns early: the two h1s are
    // mutually exclusive, never two on one page.
    expect(h1Count(detail)).toBe(1);
    expect(detail).toContain(">Reading not found</h1>");
    expect(h1Count(sections)).toBe(0);
    // The normal view also mounts HeirloomPrint, whose sheet has
    // its own h1 (the spread name), but that sheet is print-only:
    // display:none on screen and aria-hidden, shown only by the
    // print stylesheet as the printed keepsake's title. It is not
    // a second screen h1, so it stays as it is.
    expect(sections).toContain("<HeirloomPrint");
    expect(heirloom).toContain('aria-hidden="true"');
    expect(heirloom).toContain('<h1 className="heirloom-title">');
    expect(css).toMatch(
      /\.heirloom-print-sheet,\s*\.journal-print-sheet\s*\{\s*display:\s*none;\s*\}/,
    );
  });

  it("/spreads/[slug] has exactly one h1: the spread name", () => {
    const page = src("src/app/spreads/[slug]/page.tsx");
    const flow = src("src/components/ReadingFlow.tsx");
    expect(h1Count(page)).toBe(0);
    expect(h1Count(flow)).toBe(1);
    // GateScreen renders unconditionally in ReadingFlow's return,
    // and its h1 is the spread name.
    expect(flow).toContain("<GateScreen");
    expect(flow).toContain("{spread.name}");
    expect(flow).toContain('className="mt-3 font-display text-5xl text-goldbright sm:text-6xl"');
  });
});
