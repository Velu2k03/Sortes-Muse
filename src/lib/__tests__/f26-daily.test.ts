/**
 * UX audit Phase 2, F26 (daily card), as decided at the push gate.
 * Velu's 2026-11-16 decision: keep the "Draw now" tap alternative
 * gone, and make the card itself hold-and-press instead of a
 * separate button, showing a progress bar. One action only: the
 * card is the hold target (HoldCard), the bar under it fills during
 * the hold, and a tap never draws.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("F26 daily card: the card itself is hold-and-press", () => {
  it("no Draw now button and no separate draw button", () => {
    const daily = src("src/app/daily/page.tsx");
    expect(daily).not.toContain("Draw now");
    expect(daily).not.toContain("HoldButton");
    expect(daily).not.toContain("StarBorder");
    expect(daily).toContain("HoldCard");
  });

  it("the card is the hold target, 1200ms, and draws on hold", () => {
    const daily = src("src/app/daily/page.tsx");
    const holds = daily.match(/<HoldCard/g) ?? [];
    expect(holds.length).toBe(1);
    expect(daily).toContain("holdTime={1200}");
    expect(daily).toContain("onHold={draw}");
  });

  it("the hold shows a progress bar and works from the keyboard", () => {
    const card = src("src/components/HoldCard.tsx");
    // A native <progress> element, not a role: the lint rule
    // prefers the native element, and it carries its own value.
    expect(card).toContain("<progress");
    expect(card).toContain("value={percent}");
    expect(card).toContain('aria-label="Draw progress"');
    expect(card).not.toContain('role="progressbar"');
    expect(card).toContain("onKeyDown={handleKeyDown}");
    expect(card).toContain("onKeyUp={handleKeyUp}");
    expect(card).toContain('" "');
    expect(card).toContain('"Enter"');
    expect(card).toContain('aria-label="Hold to draw today\'s card"');
    expect(card).toContain("focus-visible:ring-2");
    // A tap never draws: only a completed hold fires onHold.
    expect(card).not.toContain("onTap");
    expect(card).toContain("only a completed hold fires onHold");
  });
});
