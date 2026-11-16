import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// UX audit Phase 2, F15 + F19 (2026-11-16). F15: middle-dot meta
// strings become plain words or commas. The spread name is "Past,
// Present, Future" (commas); the meta lines are comma-joined, not
// dot-joined. F19: every animate-pulse carries a
// motion-reduce:animate-none variant, so reduced-motion users see a
// static placeholder instead of a pulse.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("F15: no middle-dot meta strings", () => {
  it("the spread name uses commas, not dots", () => {
    expect(src("src/lib/tarot.ts")).toContain('name: "Past, Present, Future"');
    expect(src("src/lib/tarot.ts")).not.toContain("Past · Present · Future");
    expect(src("src/components/SampleReading.tsx")).toContain("Past, Present, Future");
    // UX audit Phase 2, F35 removed the "Past, Present, Future"
    // button from the card page, so this file no longer pins it
    // there; the spread name is still pinned in the other files.
    expect(src("src/app/reading/[id]/ReadingSections.tsx")).toContain("Try Past, Present, Future");
  });

  it("spread and deck meta lines are comma-joined", () => {
    const spreads = src("src/app/spreads/SpreadsClient.tsx");
    expect(spreads).toContain('}, personalized AI interpretation');
    expect(spreads).not.toContain("· personalized AI interpretation");
    const deck = src("src/app/deck/DeckClient.tsx");
    expect(deck).toContain('}, {c.keywords.upright.slice(0, 3).join(", ")}');
    expect(deck).not.toContain("} · {c.keywords.upright");
  });

  it("the card modal eyebrow uses commas", () => {
    const modal = src("src/components/CardModal.tsx");
    expect(modal).toContain("Major Arcana, card ${card.number}");
    expect(modal).toContain("Minor Arcana, ${card.suit");
    expect(modal).not.toContain("Major Arcana ·");
    expect(modal).not.toContain("Minor Arcana ·");
  });
});

describe("F19: every pulse respects reduced motion", () => {
  it("all six animate-pulse instances carry motion-reduce:animate-none", () => {
    const files = [
      "src/app/spreads/SpreadsClient.tsx",
      "src/app/account/AccountPanels.tsx",
      "src/app/horoscope/HoroscopeClient.tsx",
      "src/app/oracles/CreditsClient.tsx",
      "src/components/Header.tsx",
    ];
    let total = 0;
    for (const f of files) {
      const c = src(f);
      const pulseLines = c.split("\n").filter((l) => l.includes("animate-pulse"));
      total += pulseLines.length;
      for (const line of pulseLines) {
        expect(line).toContain("motion-reduce:animate-none");
      }
    }
    expect(total).toBe(6);
  });
});
