import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Phase 4 Batch 4.2 checkout modal", () => {
  const modal = src("src/components/CheckoutModal.tsx");

  it("shows only the chosen pack as an order summary, with one payment button", () => {
    expect(modal).toContain("showSummary");
    expect(modal).toContain("Continue to payment");
    expect(modal).toContain("Change pack");
    expect(modal).toContain("Total");
    // The summary button carries the pack price.
    expect(modal).toContain("`Continue to payment · $${selectedPack.price.toFixed(2)}`");
    // The full list is still there behind "Change pack".
    expect(modal).toContain("CREDIT_PACKS.map");
    // Each open starts on the summary, not the full list.
    expect(modal).toContain("setShowAllPacks(false)");
  });

  it("trims and lowercases the email, with the right input hints", () => {
    expect(modal).toContain("email.trim().toLowerCase()");
    expect(modal).not.toContain("const trimmed = email.trim()");
    expect(modal).toContain('inputMode="email"');
    expect(modal).toContain('autoComplete="email"');
  });

  it("says the checkout probe is running instead of silently disabling the buttons", () => {
    expect(modal).toContain("Checking checkout…");
    // <output> carries implicit status semantics.
    expect(modal).toContain("<output");
  });
});
