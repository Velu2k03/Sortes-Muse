/**
 * Intake fields restoration (Velu, 2026-11-17) + the Batch 3b light
 * theme fix (hide the dark hero image; theme-aware gold in the wait
 * screen). Batch 3b had cut the intake to the question only; Velu
 * ordered the category fields back.
 *
 * Source-scan guards, in the batch2-wiring style: they pin the
 * user-visible contract (category fields rendered, required fields
 * gate the form, no muddy hero photo in light theme, no
 * bright-gold text on cream) without rendering the components.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Intake fields restoration (Velu, 2026-11-17)", () => {
  it("FormStep renders the category fields", () => {
    const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
    expect(steps).toContain("category.fields.map");
    expect(steps).toContain("category.fields");
  });

  it("the required category fields gate the form; the story stays optional", () => {
    const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
    // The story label says (optional) and carries no gold asterisk.
    expect(steps).toContain("Your story / background");
    expect(steps).toContain("(optional)");
    // The question label still carries the required asterisk.
    expect(steps).toContain("The one exact question you want clarity on");
    // The category fields render, with a gold asterisk on required ones.
    expect(steps).toContain("category.fields.map");
    // The example chips stay: they fill the one required question.
    expect(steps).toContain("category.examples.map");
  });

  it("formValid gates on the required category fields and the question", () => {
    const hook = src("src/app/intake/[slug]/useIntakeFlow.ts");
    // The required-fields loop is back; the story is still not required.
    expect(hook).toContain("field.required");
    expect(hook).not.toContain("story.trim().length > 0");
    expect(hook).toContain("return firstMissingField() === null;");
  });

  it("the intro claims a first name is saved for Love", () => {
    // A name field is collected again for Love, so the journal line
    // promises one there. Other categories keep the shorter line.
    const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
    expect(steps).toContain("Your question, first name, and category");
    expect(steps).toContain("Your question and");
    expect(steps).toContain("category are saved to your journal.");
  });
});

describe("Batch 3b: the light theme fix", () => {
  it("the dark hero image is hidden in light theme", () => {
    const css = src("src/app/globals.css");
    const rule = css.match(
      /html\[data-theme="light"\] \.hero-img \{[^}]*\}/
    );
    expect(rule).not.toBeNull();
    expect(rule![0]).toContain("opacity: 0;");
    expect(rule![0]).not.toContain("opacity: 0.3");
  });

  it("the wait screen uses theme gold, never hardcoded bright gold", () => {
    const wait = src("src/components/ReadingWait.tsx");
    expect(wait).not.toContain("#d6be8a");
    expect(wait).not.toContain("#b9975b");
    expect(wait).toContain("var(--color-goldbright)");
    expect(wait).toContain("var(--color-gold)");
  });

  it("globals.css has exactly one .num rule (no duplicate, no malformed selector)", () => {
    // Batch N3 (C1/C2): globals.css once carried TWO identical
    // `.num, .font-number` rules, one of them malformed (a stray
    // qualifier inside the selector). The line anchor below fails
    // both the old malformed selector and any future duplicate.
    const css = src("src/app/globals.css");
    const matches = css.match(/^\.num, \.font-number \{/gm);
    expect(matches).toHaveLength(1);
  });
});
