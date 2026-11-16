/**
 * UX audit Phase 2, F34 (deck toolbar).
 * The view buttons shared the filter pills' solid-gold selected
 * style, so "All 78" and "List" both read as gold-selected at once
 * in different groups. The view's selected state is a gold outline
 * + tint, never a solid fill, so only the filter ever reads as
 * solid gold.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("F34 one solid-gold selected state per toolbar", () => {
  it("only the filter pills use a solid-gold selected style", () => {
    const deck = src("src/app/deck/DeckClient.tsx");
    // Filter pills: solid gold when selected.
    expect(deck).toContain('filter === f.key\n                    ? "bg-gold text-ink"');
    // View buttons: gold outline + tint when selected, never solid.
    for (const view of ["list", "grid", "spiral"]) {
      expect(deck).toContain(
        `effectiveView === "${view}"\n                  ? "border border-gold bg-gold/10 text-goldbright"`
      );
    }
    expect(deck).not.toContain('effectiveView === "list"\n                  ? "bg-gold text-ink"');
  });
});
