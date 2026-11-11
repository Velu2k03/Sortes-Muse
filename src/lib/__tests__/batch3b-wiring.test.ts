/**
 * Batch 3b wiring guards: the intake field cut (Velu: "cut it", one
 * required field only, the question) and the light theme fix (hide
 * the dark hero image; theme-aware gold in the wait screen).
 *
 * Source-scan guards, in the batch2-wiring style: they pin the
 * user-visible contract (no category fields rendered, only the
 * question gates the form, no muddy hero photo in light theme, no
 * bright-gold text on cream) without rendering the components.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Batch 3b: the intake field cut", () => {
  it("FormStep renders no category fields", () => {
    const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
    expect(steps).not.toContain("category.fields.map");
    expect(steps).not.toContain("category.fields");
  });

  it("the question is the only required field; the story is optional", () => {
    const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
    // The story label says (optional) and carries no gold asterisk.
    expect(steps).toContain("Your story / background");
    expect(steps).toContain("(optional)");
    // The question label still carries the required asterisk.
    expect(steps).toContain("The one exact question you want clarity on");
    // The example chips stay: they fill the one required field.
    expect(steps).toContain("category.examples.map");
  });

  it("formValid gates only on the question", () => {
    const hook = src("src/app/intake/[slug]/useIntakeFlow.ts");
    // The required-fields loop and the story requirement are gone.
    expect(hook).not.toContain("f.required");
    expect(hook).not.toContain("story.trim().length > 0");
    expect(hook).toContain("return question.trim().length > 0;");
  });

  it("the intro no longer claims a first name is saved", () => {
    // No name field is collected any more, so the journal line must
    // not promise one.
    const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
    expect(steps).toContain("Your question and");
    expect(steps).toContain("category are saved to your journal.");
    expect(steps).not.toContain("Your question, first name, and category");
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
    expect(wait).not.toContain("#f4d03f");
    expect(wait).not.toContain("#d4af37");
    expect(wait).toContain("var(--color-goldbright)");
    expect(wait).toContain("var(--color-gold)");
  });
});
