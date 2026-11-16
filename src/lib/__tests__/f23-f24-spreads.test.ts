/**
 * UX audit Phase 2, F23-F24 (spreads repetition).
 * F23: "Start my free reading" appeared twice on the spreads page
 * (hero banner + Quick Insight card), and the Quick Insight
 * description said one idea three ways. F24: "free, no payment card
 * required" appeared four times on the Quick Insight detail screen.
 * Fix: one CTA per screen, one sentence per card, say free once.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("F23 one CTA per screen, one sentence per card", () => {
  it("the Quick Insight description is one sentence, one idea", () => {
    const tarot = src("src/lib/tarot.ts");
    expect(tarot).toContain('description: "One card for one question."');
    expect(tarot).not.toContain("first Quick Insight reading is free");
    expect(tarot).not.toContain("Draw a single card for a focused answer");
    expect(tarot).not.toContain("no payment card required");
  });

  it("Start my free reading appears exactly once on the spreads page (the hero banner)", () => {
    const spreads = src("src/app/spreads/SpreadsClient.tsx");
    const count = (spreads.match(/Start my free reading/g) ?? []).length;
    expect(count).toBe(1);
    // Every spread card, Quick Insight included, says Begin reading.
    expect(spreads).toContain("Begin reading");
    expect(spreads).not.toContain(
      's.slug === "quick-insight" && freeAvailable ? "Start my free reading"'
    );
  });
});

describe("F24 free is said once on the Quick Insight detail screen", () => {
  it("the line under the button keeps only the limit, not the free claim", () => {
    const flow = src("src/components/ReadingFlow.tsx");
    expect(flow).not.toContain("Free, no payment card required");
    expect(flow).toContain("One free Quick Insight per");
    // The button itself still says free; that is the one place.
    expect(flow).toContain("Start my free reading");
  });
});
