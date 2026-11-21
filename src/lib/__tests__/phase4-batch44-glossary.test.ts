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
  "src/app/spreads/SpreadsClient.tsx",
];

// Credit cutover (2026-11-20): the unit is renamed from "Oracle" to
// "credits" in the UI (audit §4, Velu's decision). The glossary rule is
// inverted: these files used to be barred from saying "credit"; now
// they must not show the old Oracle unit in a label.
describe("Phase 4 Batch 4.4 money glossary", () => {
  it("never shows the retired Oracle unit in a user-facing label", () => {
    for (const file of UI_FILES) {
      const text = src(file);
      expect(text, file).not.toContain("Get Oracles");
      expect(text, file).not.toContain("Oracle balance");
      expect(text, file).not.toContain("Monthly Oracles");
      expect(text, file).not.toContain("Purchased Oracles");
      expect(text, file).not.toContain("Top up Oracles");
      expect(text, file).not.toMatch(/· 1 Oracle|uses 1 Oracle|"Oracle" : "Oracles"/);
    }
  });

  it("names the unit 'credits' in the balance and top-up labels", () => {
    expect(src("src/components/Header.tsx")).toContain("Get credits");
    expect(src("src/app/account/AccountPanels.tsx")).toContain("Credit balance");
    expect(src("src/app/account/AccountPanels.tsx")).toContain("Monthly credits");
    expect(src("src/app/account/AccountPanels.tsx")).toContain("Purchased credits");
    expect(src("src/components/PurchaseConfirmer.tsx")).toContain("Your credits are in your balance");
    expect(src("src/app/spreads/SpreadsClient.tsx")).toContain("Top up credits");
  });

  it("never says 'Log in' or 'Register' in UI strings", () => {
    for (const file of UI_FILES) {
      const text = src(file);
      expect(text).not.toContain("Log in");
      expect(text).not.toContain("Register");
    }
  });

  it("states the cost as one phrase: this spread's credit price", () => {
    const flow = src("src/components/ReadingFlow.tsx");
    // Both cost buttons carry the same cost tag, from the spread size.
    const tag = "{creditsLabel(readingCostForSpreadCards(spread.cards))}";
    expect(flow).toContain(`Personalize and begin · ${tag}`);
    expect(flow).toContain(`Get credits · ${tag}`);
    expect(flow).toContain(`This reading uses ${tag}.`);
    expect(flow).toContain("credits >= readingCostForSpreadCards(spread.cards)");
    // The spreads page is another entry point; it prices each spread
    // from its card count and gates Begin on that price.
    const spreads = src("src/app/spreads/SpreadsClient.tsx");
    expect(spreads).toContain("creditsLabel(spreadCost(s.slug))");
    expect(spreads).toContain("balance >= spreadCost(slug)");
    expect(spreads).toContain("100 for one card, 200 for three, 300 for the Celtic Cross");
  });

  it("uses 'Sign in' and 'Sign up', not one-word forms", () => {
    for (const file of UI_FILES) {
      const text = src(file);
      // The one-word forms must not appear as UI copy.
      expect(text).not.toMatch(/"Login"/);
      expect(text).not.toMatch(/"Signup"/);
    }
  });

  it("uses 'Sign up' for making a new account, never 'Create account'", () => {
    // Batch 4.3 (Velu, 2026-11-16): "Sign up" and "Sign in".
    // The glossary and the account page say "Sign up"; the old
    // "Create account" wording must not appear in the money-flow
    // UI files or the account client. Pin the heading too: the
    // signup panel heading is "Sign up to sync everything", not
    // "Create your account" (Codex P2, PR #116).
    const account = src("src/app/account/AccountClient.tsx");
    expect(account).toContain('"Sign up"');
    expect(account).toContain("Sign up to sync everything");
    expect(account).not.toContain("Create account");
    expect(account).not.toContain("Create your account");
    for (const file of UI_FILES) {
      expect(src(file)).not.toContain("Create account");
    }
    expect(src("docs/glossary.md")).toContain('"Sign up"');
    expect(src("docs/glossary.md")).not.toContain("Create account");
  });
});
