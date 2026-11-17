/**
 * Intake fields restoration (Velu, 2026-11-17): the Batch 3b-cut
 * category fields are back in the form. Guards: every date field is
 * on the sensitive list (birthdays never leave the device), the
 * privacy page uses Velu's approved wording, and the AI prompt shows
 * field labels, not raw keys.
 *
 * Source-scan guards, in the batch2-wiring style.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { INTAKE_CATEGORIES, SENSITIVE_KEYS } from "@/lib/intake";

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Intake fields restoration", () => {
  it("every date field is on the sensitive list", () => {
    // Birthdays are the only date fields, and they must never leave
    // the device or reach the AI. If a new date field is added, it
    // must be added to SENSITIVE_KEYS too, or this test fails on purpose.
    const dateFields: string[] = [];
    for (const category of INTAKE_CATEGORIES) {
      for (const field of category.fields) {
        if (field.type === "date") dateFields.push(field.key);
      }
    }
    expect(dateFields.length).toBeGreaterThan(0);
    for (const key of dateFields) {
      expect(SENSITIVE_KEYS).toContain(key);
    }
  });

  it("the privacy page uses Velu's approved wording", () => {
    const privacy = src("src/app/privacy/page.tsx");
    expect(privacy).toContain("The AI sees your first name, the details you entered,");
    expect(privacy).toContain("Birthdays stay on your device. They");
    expect(privacy).toContain("are never sent or stored.");
    expect(privacy).not.toContain("only your first name and the");
  });

  it("the generate route shows field labels, not raw keys", () => {
    const route = src("src/app/api/reading/generate/route.ts");
    expect(route).toContain("labelFor");
    expect(route).toContain("typeof v === \"string\"");
  });

  it("the confirm step shows the filled details, minus birthdays", () => {
    const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
    expect(steps).toContain("Your details");
    expect(steps).toContain("SENSITIVE_KEYS.includes(field.key)");
    expect(steps).toContain("filledDetails");
  });

  it("the form focuses the first missing field", () => {
    const hook = src("src/app/intake/[slug]/useIntakeFlow.ts");
    expect(hook).toContain("firstMissingField");
    const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
    expect(steps).toContain("fieldRefs.current[missing]?.focus()");
  });
});
