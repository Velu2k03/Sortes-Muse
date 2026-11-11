/**
 * Batch 5 wiring guards: the List view for /deck (Velu: "Build the
 * List view for /deck"). The list is the default view; the grid and
 * the spiral are opt-ins.
 *
 * Source-scan guards, in the batch2-wiring style: they pin the
 * user-visible contract (a List toggle exists, the list renders
 * one link per card with a name + arcana/suit + keywords, rows
 * are at least 44px tall, the list is the default) without
 * rendering the component.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Batch 5: the List view for /deck", () => {
  it("the list is the default view and the spiral falls back to it", () => {
    const cards = src("src/lib/cards.ts");
    expect(cards).toContain('"grid" | "list" | "spiral"');
    expect(cards).toContain('DEFAULT_DECK_VIEW: DeckView = "list"');
    expect(cards).toContain('requested === "spiral" ? "list" : requested');
  });

  it("the view toggle offers List first", () => {
    const deck = src("src/app/deck/DeckClient.tsx");
    expect(deck).toContain('aria-pressed={effectiveView === "list"}');
    expect(deck).toContain('onClick={() => setView("list")}');
    // The List button comes before the Card grid button.
    expect(deck.indexOf('effectiveView === "list"')).toBeLessThan(
      deck.indexOf('effectiveView === "grid"')
    );
  });

  it("the list renders one link per card with name, arcana/suit and keywords", () => {
    const deck = src("src/app/deck/DeckClient.tsx");
    expect(deck).toContain('effectiveView === "list"');
    expect(deck).toContain('<ul className="mt-6 space-y-2">');
    expect(deck).toContain("Major Arcana");
    expect(deck).toContain('suitLabel(c.suit ?? "")');
    expect(deck).toContain("c.keywords.upright.slice(0, 3).join");
    expect(deck).toContain("min-h-[44px]");
  });

  it("the spiral note points keyboard users at the List", () => {
    const deck = src("src/app/deck/DeckClient.tsx");
    expect(deck).toContain("switch to List above");
    expect(deck).not.toContain("switch to Card grid above");
  });
});
