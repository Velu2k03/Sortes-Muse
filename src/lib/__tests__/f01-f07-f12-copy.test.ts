import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// UX audit Phase 2, F01 + F07 + F12 (2026-11-16): packs were retired
// in PR #118 (Velu, D1), but three pages still sold or named them.
// These are factual corrections, one sentence each. The backend
// CREDIT_PACKS data and the purchase-history pack_type column are
// intentionally kept (existing purchases and refunds still validate),
// so this test pins only the user-visible copy.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("F01/F07/F12: no stale pack wording in user-visible copy", () => {
  it("About sells top-ups, not packs (F01)", () => {
    const about = src("src/app/about/page.tsx");
    // Phase 7 (7.3): the pricing tail is cut from the offers section
    // per the cut list, it duplicates the pricing page and the FAQ.
    // The page now mentions neither packs nor top-ups; the F01
    // requirement that remains is no stale pack wording.
    expect(about).not.toContain("in packs sold through Lemon Squeezy");
    expect(about).not.toContain("Oracle packs");
  });

  it("Privacy names the top-up or subscription type, not the pack type (F12)", () => {
    const privacy = src("src/app/privacy/page.tsx");
    expect(privacy).toContain("the top-up or subscription type");
    expect(privacy).not.toContain("the pack type");
    expect(privacy).toContain("Payments for credit top-ups and subscriptions");
    expect(privacy).not.toContain("Payments for Oracle packs");
  });

  it("deck search placeholder is short enough not to clip (F07)", () => {
    const deck = src("src/app/deck/DeckClient.tsx");
    expect(deck).toContain('placeholder="Search cards, e.g. moon"');
    expect(deck).not.toContain("Search cards, e.g. moon, strength");
  });
});
