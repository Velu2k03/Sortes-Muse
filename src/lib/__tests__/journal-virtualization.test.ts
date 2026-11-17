/**
 * Journal virtualization wiring guards (all-pages audit, Top 10
 * fix 1, /journal half). The Vercel guideline fails large lists
 * over 50 items rendered directly; /deck got this treatment in
 * PR #132, and the audit flagged /journal next: HistoryClient.tsx
 * rendered groupReadingsByDay(filteredHistory).map with every
 * reading mapped, no slice, cap, or pagination on the main list
 * (only slice(0,3) is for the repeated-questions summary and
 * slice(0,5) is for card thumbnails), while storage caps history
 * at MAX_HISTORY 100, so all 100 would still render.
 *
 * The timeline is a single list view, grouped by day, so there is
 * no grid view here and no content-visibility alternative to pick:
 * the day-grouped list IS the view, and plain Virtuoso over
 * flattened rows (one header row per day, then one row per reading)
 * keeps the day headers in the flow with the readings under them.
 * NOT GroupedVirtuoso: in isolation (stock component, no custom
 * List/Item, no computeItemKey, no initialItemCount, data
 * ["AAA-first", "BBB-second", "CCC-third"], groupCounts [3]) it
 * renders the header, BBB and CCC but drops the first data element
 * AAA entirely, and the same off-by-one showed on /journal (the
 * newest reading of the first day never mounted). react-virtuoso
 * is already installed from PR #132; no new library.
 *
 * Source-scan guards, in the batch2-wiring style: they pin the
 * user-visible contract (only visible rows in the DOM, day grouping
 * kept, all readings still reachable, same card, same links, same
 * delete arm/confirm) without rendering the component.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { groupReadingsByDay } from "@/lib/journal";
import type { Reading } from "@/lib/types";

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

function fakeReading(id: string, createdAt: string): Reading {
  return {
    id,
    createdAt,
    spreadName: "Quick Insight",
    spreadSlug: "quick-insight",
    cards: [],
  } as unknown as Reading;
}

// Local-time dates, so the day grouping holds in any timezone:
// a fixed UTC string can straddle midnight in some zones.
const day = (y: number, m: number, d: number, h: number) =>
  new Date(y, m, d, h, 0, 0).toISOString();

describe("Journal virtualization", () => {
  it("react-virtuoso is already installed, the curated pick for long lists", () => {
    const pkg = JSON.parse(src("package.json")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies["react-virtuoso"]).toBeDefined();
    const journal = src("src/app/journal/HistoryClient.tsx");
    expect(journal).toContain('from "react-virtuoso"');
    expect(journal).toContain("Virtuoso");
  });

  it("the timeline is virtualized on the window scroll, flattened rows, grouped by day", () => {
    const journal = src("src/app/journal/HistoryClient.tsx");
    // Plain Virtuoso, the same component /deck uses: GroupedVirtuoso
    // drops the first data element (reproduced in isolation), so the
    // day grouping is flattened into rows instead.
    expect(journal).toContain("<Virtuoso");
    // No grouped component in use (the word still appears in the
    // comment explaining why it was rejected, so assert the JSX
    // tag and props are absent, not the word itself).
    expect(journal).not.toContain("<GroupedVirtuoso");
    expect(journal).not.toContain("groupCounts={");
    expect(journal).not.toContain("groupContent={");
    expect(journal).toContain("useWindowScroll");
    expect(journal).toContain("data={timelineRows}");
    // One header row per day, then one row per reading under it.
    expect(journal).toContain(
      "dayGroups.flatMap((g): TimelineRow[] => [",
    );
    expect(journal).toContain(
      '{ type: "header", key: `day-${g.label}`, label: g.label },',
    );
    expect(journal).toContain("computeItemKey={(_index, row) => row.key}");
    expect(journal).toContain("itemContent={(index, row) =>");
    // SSR renders the first rows so the list is not empty on first
    // paint; defaultItemHeight is a mid estimate (desktop rows are
    // ~150px, stacked mobile rows ~260px, day headers ~20px).
    expect(journal).toContain("initialItemCount={20}");
    expect(journal).toContain("defaultItemHeight={200}");
    // A small viewport buffer, so fast scrolling does not flash
    // empty space before new rows mount.
    expect(journal).toContain("increaseViewportBy={300}");
  });

  it("the list spacing stays margins, never flex gap (the /deck RangeError)", () => {
    const journal = src("src/app/journal/HistoryClient.tsx");
    // Virtuoso measures items by their offset positions, and the
    // margins space-y adds are part of those offsets. On /deck,
    // flex column + gap on the virtualized list made the size model
    // drift (gap is not part of offset positions) and recurse into
    // RangeError: Maximum call stack size exceeded on scroll, so
    // the List is a plain div with space-y-4, never flex + gap.
    // (flex flex-col still appears inside the card itself, for its
    // own stacked layout; that is not the List container.)
    expect(journal).toContain('className="mt-10 space-y-4"');
    expect(journal).not.toContain("VirtuosoGrid");
  });

  it("the timeline card is unchanged: same thumbnails, links, delete arm/confirm", () => {
    const journal = src("src/app/journal/HistoryClient.tsx");
    expect(journal).toContain("itemContent={(index, row) =>");
    expect(journal).toContain("<JournalReadingCard");
    expect(journal).toContain("href={`/reading/${r.id}`}");    expect(journal).toContain('className="btn-ghost rounded-xl px-4 py-3 text-sm font-semibold"');
    expect(journal).toContain("Open reading");
    expect(journal).toContain("Follow-up");
    // Two-step delete, first tap arms, second tap deletes, same as
    // before: the handler moved out of the card so the card stays
    // presentational, the wording is unchanged.
    expect(journal).toContain('"Confirm delete?"');
    expect(journal).toContain(
      '"Could not delete that reading. Please try again."',
    );
    // All readings are still in the data, so all are still reachable
    // by scrolling, filtering, or searching; virtualization only
    // removes off-screen rows from the DOM.
    expect(journal).toContain("dayGroups.flatMap((g): TimelineRow[] => [");
  });

  it("the print sheet still renders every reading, unvirtualized", () => {
    const journal = src("src/app/journal/HistoryClient.tsx");
    // window.print() needs the full journal, and the sheet is
    // display: none on screen, so it keeps the direct map.
    expect(journal).toContain('<div className="journal-print-sheet">');
    expect(journal).toContain(
      "{groupReadingsByDay(filteredHistory).map((group) => (",
    );
  });

  it("grouping keeps day order and sort order", () => {
    // Newest first: two readings on Nov 17, one on Nov 16.
    const groups = groupReadingsByDay([
      fakeReading("r1", day(2026, 10, 17, 10)),
      fakeReading("r2", day(2026, 10, 17, 9)),
      fakeReading("r3", day(2026, 10, 16, 10)),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].readings.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(groups[1].readings.map((r) => r.id)).toEqual(["r3"]);
    // The flattened rows carry one header row per day, then one row
    // per reading under it, in the same order.
    expect(groups.map((g) => g.readings.length)).toEqual([2, 1]);
  });
});
