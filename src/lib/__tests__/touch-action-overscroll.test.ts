/**
 * All-pages fix 9 (touch-action + overscroll, 2026-11-17):
 * the audit found no `touch-action: manipulation` anywhere in the
 * app (Vercel touch rule) and no `overscroll-behavior: contain`
 * on CardModal (Vercel modal rule).
 *
 * Touch half: one rule in globals.css removes the mobile tap delay
 * on interactive elements. The selector is interactive elements
 * only (a, button, input, select, textarea, label, summary,
 * [role="button"]), not html/body/*, so drag surfaces (the /deck
 * spiral, OptionWheel, TarotCard) keep their own touch handling.
 *
 * Overscroll half: the scrollable CardModal panel
 * (overflow-y-auto) carries overscroll-contain, so scrolling to
 * its top or bottom no longer scrolls the page behind the modal.
 * The rule lives on the panel, not the backdrop.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("all-pages fix 9: touch-action + overscroll", () => {
  it("sets touch-action: manipulation on interactive elements in globals.css", () => {
    const css = src("src/app/globals.css");
    const at = css.indexOf("touch-action: manipulation;");
    expect(at).toBeGreaterThan(-1);
    // The selectors belong to this rule, not just somewhere in the
    // file: take the selector list directly before the declaration.
    const ruleHead = css.slice(Math.max(0, at - 200), at);
    for (const selector of [
      "a,",
      "button,",
      "input,",
      "select,",
      "textarea,",
      "label,",
      "summary,",
      '[role="button"]',
    ]) {
      expect(ruleHead).toContain(selector);
    }
  });

  it("does not put touch-action on html, body, or every element", () => {
    const css = src("src/app/globals.css");
    // Drag surfaces (the /deck spiral, OptionWheel, TarotCard) must
    // keep their own touch handling; a blanket rule would touch them.
    expect(css).not.toMatch(/^(html|body|\*)\s*\{[^}]*touch-action/m);
    expect(css).not.toContain("* {\n  touch-action");
  });

  it("gives the scrollable CardModal panel overscroll-contain", () => {
    const modal = src("src/components/CardModal.tsx");
    expect(modal).toContain("overscroll-contain");
    // The panel is the scrollable element: the rule must sit on the
    // same class list as overflow-y-auto, not on the backdrop.
    const panel = modal.match(/className="[^"]*overflow-y-auto[^"]*"/);
    expect(panel).not.toBeNull();
    expect(panel![0]).toContain("overscroll-contain");
  });

  it("does not change the CardModal dialog contract", () => {
    const modal = src("src/components/CardModal.tsx");
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain("max-h-[92vh]");
  });
});
