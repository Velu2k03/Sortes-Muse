import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Phase 3 Batch 3.1 intake form and no dead end", () => {
  const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
  const flow = src("src/app/intake/[slug]/useIntakeFlow.ts");

  it("makes the required question a two-row textarea capped at the server limit", () => {
    // Server rejects questions over 300 chars (generate/route.ts).
    const server = src("src/app/api/reading/generate/route.ts");
    expect(server).toContain("intake.question.length > 300");
    // The form-step question field is a two-row textarea capped at 300.
    expect(steps).toContain('id="intake-question"');
    expect(steps).toContain("rows={2}");
    expect(steps).toContain("maxLength={300}");
    expect(steps).toContain('aria-label="Your question"');
    // No one-line text input remains for the question in either step.
    expect(steps).not.toContain('id="intake-question"\n            type="text"');
    expect(steps).not.toContain('<input\n                type="text"\n                value={question}');
  });

  it("keeps Review my reading enabled and shows an inline error with focus", () => {
    expect(steps).toContain("Review my reading");
    // The disabled gate on the review button is gone.
    expect(steps).not.toContain("disabled={!formValid()}");
    // The inline error exists and is tied to the field.
    expect(steps).toContain('id="intake-question-error"');
    expect(steps).toContain('aria-describedby={questionError ? "intake-question-error" : undefined}');
    expect(steps).toContain("aria-invalid={questionError}");
    expect(steps).toContain("questionRef.current?.focus()");
    expect(steps).toContain("Please write your question first");
    // The error also clears when an example chip fills the question.
    expect(steps).toContain("onClick={() => { setQuestion(ex); setQuestionError(false); }}");
  });

  it("gives a zero-Oracle user a Get Oracles link instead of a dead end", () => {
    expect(flow).toContain('setError("You are out of Oracles. Please top up to continue.")');
    // The server 402 message also gets the link (client balance can be stale).
    const server = src("src/app/api/reading/generate/route.ts");
    expect(server).toContain('error: "You need 1 Oracle for this reading. No Oracle was spent."');
    expect(steps).toContain('error.startsWith("You need 1 Oracle")');
    // Both error alerts offer the link when the error is an out-of-Oracles one.
    const links = steps.match(/error\.startsWith\("You need 1 Oracle"\)[\s\S]*?Get Oracles/g) ?? [];
    expect(links.length).toBe(2);
    expect(steps).toContain('href="/pricing"');
  });

  it("announces each step name to screen readers on mobile", () => {
    expect(steps).toContain("aria-label={`Step ${i + 1}: ${labels[i]}`}");
    // The visible labels are still hidden below sm; the aria-label covers it.
    expect(steps).toContain('className={`hidden text-xs sm:inline');
  });

  it("takes the toast colours from the brand tokens, not raw hex", () => {
    // The toast is now the one Sonner Toaster (SonnerToaster.tsx).
    const toaster = readFileSync(
      path.resolve(process.cwd(), "src/components/SonnerToaster.tsx"),
      "utf8"
    );
    expect(toaster).toContain('"--normal-bg": "var(--color-panel)"');
    expect(toaster).toContain('"--normal-text": "var(--color-cream)"');
    expect(toaster).toContain("var(--color-gold)");
    expect(toaster).not.toContain("#b9975b");
    expect(steps).not.toContain('background="#1a2a44"');
  });
});
