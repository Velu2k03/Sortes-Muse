/**
 * Deck virtualization wiring guards (all-pages audit, fix 1).
 * The Vercel guideline fails large lists over 50 items rendered
 * directly; /deck renders 78 cards. The List view (the default)
 * is truly virtualized with Virtuoso, the pick-ui-library curated
 * pick for long lists, installed as react-virtuoso. The Grid view
 * uses content-visibility instead: true windowing would remount
 * tiles on scroll-back and replay their entrance animation, and
 * content-visibility is the Vercel guideline's named alternative.
 * The Spiral view is untouched (a 3D helix, not a list).
 *
 * Source-scan guards, in the batch2-wiring style: they pin the
 * user-visible contract (only visible rows in the DOM, all 78
 * cards still reachable, same links, same rows) without rendering
 * the component.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CARDS, filterDeckCards } from "@/lib/cards";

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Deck virtualization", () => {
  it("react-virtuoso is installed, the curated pick for long lists", () => {
    const pkg = JSON.parse(src("package.json")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies["react-virtuoso"]).toBeDefined();
    const deck = src("src/app/deck/DeckClient.tsx");
    expect(deck).toContain('from "react-virtuoso"');
    expect(deck).toContain("Virtuoso");
  });

  it("the List view is virtualized on the window scroll, with a real ul/li", () => {
    const deck = src("src/app/deck/DeckClient.tsx");
    expect(deck).toContain("<Virtuoso");
    expect(deck).toContain("useWindowScroll");
    expect(deck).toContain("data={cards}");
    expect(deck).toContain("computeItemKey={(_index, card) => card.id}");
    // SSR renders the first rows so the list is not empty on first
    // paint; defaultItemHeight is the ~86px row (h-16 thumb + py-2.5).
    expect(deck).toContain("initialItemCount={20}");
    expect(deck).toContain("defaultItemHeight={86}");
    // A small viewport buffer, so fast scrolling does not flash
    // empty space before new rows mount.
    expect(deck).toContain("increaseViewportBy={300}");
    // The list stays a real <ul> with real <li> rows, so the Batch 5
    // keyboard- and screen-reader-friendly contract holds.
    expect(deck).toContain("HTMLUListElement");
    expect(deck).toContain("<li style={style}");
  });

  it("the List view still renders one link per card, same row, same 44px", () => {
    const deck = src("src/app/deck/DeckClient.tsx");
    expect(deck).toContain("itemContent={(i, c) => (");
    expect(deck).toContain("href={`/deck/${cardSlug(c.name)}`}");
    expect(deck).toContain("min-h-[44px]");
    expect(deck).toContain("c.keywords.upright.slice(0, 3).join");
    expect(deck).toContain('suitLabel(c.suit ?? "")');
    // All 78 cards are still in the data, so all are still reachable
    // by scrolling, filtering, or searching; virtualization only
    // removes off-screen rows from the DOM.
    expect(CARDS).toHaveLength(78);
    expect(filterDeckCards("all", "")).toHaveLength(78);
  });

  it("the Grid view skips off-screen rendering with content-visibility", () => {
    const deck = src("src/app/deck/DeckClient.tsx");
    expect(deck).toContain('contentVisibility: "auto"');
    expect(deck).toContain('containIntrinsicSize: "auto 320px"');
    // No grid windowing: it would remount tiles on scroll-back
    // and replay their entrance animation on every scroll.
    expect(deck).not.toContain("VirtuosoGrid");
    // The grid tiles and their entrance are otherwise unchanged.
    expect(deck).toContain("duration: 0.4");
    expect(deck).toContain('aria-label={`View meaning of ${c.name}`}');
  });

  it("the Spiral view is untouched by virtualization", () => {
    const deck = src("src/app/deck/DeckClient.tsx");
    expect(deck).toContain("InfiniteSpiral");
    expect(deck).toContain("items={cards.map((c) => ({");
  });
});
