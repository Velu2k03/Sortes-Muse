import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

// The money-flow UI files. The glossary (docs/glossary.md) is the source
// of truth for the words in these files.
const UI_FILES = [
  "src/components/ReadingFlow.tsx",
  "src/components/Header.tsx",
  "src/app/account/AccountPanels.tsx",
  "src/components/PurchaseConfirmer.tsx",
];

describe("Phase 4 Batch 4.4 money glossary", () => {
  it("never says 'credit' as a standalone word in UI strings", () => {
    for (const file of UI_FILES) {
      const text = src(file);
      // Whole-word "credit" only. This allows the internal identifiers
      // the code already uses: the `credits` variable, CREDIT_PACKS,
      // sortes:credits-changed, and /api/credits/*.
      expect(text).not.toMatch(/\bcredit\b/i);
    }
  });

  it("never says 'Log in' or 'Register' in UI strings", () => {
    for (const file of UI_FILES) {
      const text = src(file);
      expect(text).not.toContain("Log in");
      expect(text).not.toContain("Register");
    }
  });

  it("states the cost as one phrase: 1 Oracle", () => {
    const flow = src("src/components/ReadingFlow.tsx");
    // Both cost buttons carry the same cost tag.
    expect(flow).toContain("Personalize and begin · 1 Oracle");
    expect(flow).toContain("Get Oracles · 1 Oracle");
    expect(flow).not.toContain("1 Oracle per reading");
    expect(flow).toContain("This reading uses 1 Oracle.");
  });

  it("uses 'Sign in' and 'Create account', not one-word forms", () => {
    for (const file of UI_FILES) {
      const text = src(file);
      // The one-word forms must not appear as UI copy.
      expect(text).not.toMatch(/"Login"/);
      expect(text).not.toMatch(/"Signup"/);
    }
  });
});
