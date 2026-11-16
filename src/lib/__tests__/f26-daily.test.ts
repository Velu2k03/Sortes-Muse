/**
 * UX audit Phase 2, F26 (daily card).
 * Two actions did the same thing (HoldButton + "Draw now"), and an
 * instruction line explained the control. One action now: the hold
 * ritual stays, the button label says "Hold", and the gold fill shows
 * progress on any press, so the control teaches itself.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("F26 daily card has one draw action", () => {
  it("no Draw now button and no instruction line explaining the hold", () => {
    const daily = src("src/app/daily/page.tsx");
    expect(daily).not.toContain("Draw now");
    expect(daily).not.toContain("Press and hold the button until the gold fills it");
    expect(daily).toContain("UX audit Phase 2, F26");
  });

  it("the hold ritual stays: one HoldButton, labelled Hold", () => {
    const daily = src("src/app/daily/page.tsx");
    const holds = daily.match(/<HoldButton/g) ?? [];
    expect(holds.length).toBe(1);
    expect(daily).toContain("Hold to draw today&apos;s card");
    expect(daily).toContain('holdTime={1200}');
  });
});
