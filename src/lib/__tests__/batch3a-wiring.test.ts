import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { focusStepElement } from "@/app/intake/[slug]/IntakeSteps";

const src = (p: string) => readFileSync(p, "utf8");

// Batch 3a (Claude H1): on every intake step change the page must
// scroll to the top of the step and move focus to its heading, so
// the user never stares at the footer after tapping Continue.
describe("Batch 3a wiring", () => {
  const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");
  const flow = src("src/app/intake/[slug]/IntakeFlow.tsx");

  it("all four step headings use the hook and are focusable with scroll margin", () => {
    // Category, Form, Confirm, Impression: one hook call each.
    const uses = steps.match(/useStepFocus<HTMLHeadingElement>\(\)/g) ?? [];
    expect(uses).toHaveLength(4);
    // Each step h1 carries the ref, tabIndex -1, scroll-mt-32
    // (clears the sticky 64px header plus the "Step N of 4" label
    // above the heading) and no focus ring.
    const headings = steps.match(/<h1 ref=\{headingRef\} tabIndex=\{-1\} className="[^"]*scroll-mt-32[^"]*outline-none[^"]*">/g) ?? [];
    expect(headings).toHaveLength(4);
  });

  it("the wait screen is its own component that mounts after the exit", () => {
    // Review B1: an effect in IntakeFlow keyed on `step` runs while
    // the old step is still exiting (AnimatePresence mode="wait"),
    // so the div is not in the DOM yet and nothing re-runs it.
    // ProcessingStage mounts after the exit, like the four steps.
    expect(steps).toContain("export function ProcessingStage");
    expect(steps).toContain("useStepFocus<HTMLDivElement>()");
    expect(flow).toContain("<ProcessingStage key=\"processing\"");
    expect(flow).not.toContain("processingRef");
    // Focusing the div reads its label, not the whole processing
    // list inside ReadingWait.
    expect(steps).toContain('aria-label="Creating your reading"');
  });

  it("both intake error messages are announced", () => {
    // Re-check: the retry-path error sits in normal flow (the toast
    // is inline, not fixed), so a scroll to the heading can leave
    // it below the fold. role="alert" announces it on mount.
    const alerts = steps.match(/<p role="alert"/g) ?? [];
    expect(alerts).toHaveLength(2);
  });
});

describe("focusStepElement", () => {
  const fake = (top: number, bottom: number) => ({
    scrollIntoView: vi.fn(),
    focus: vi.fn(),
    getBoundingClientRect: () => ({ top, bottom }),
  });

  it("scrolls and focuses when the heading is above the viewport", () => {
    const el = fake(-40, 10);
    focusStepElement(el, false, 800);
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(el.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("scrolls instantly under reduced motion", () => {
    const el = fake(-40, 10);
    focusStepElement(el, true, 800);
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });

  it("does not scroll when the heading is already fully visible, but still focuses", () => {
    // Arrival: the page is at the top and the heading is in view, so
    // scrolling would only hide the breadcrumbs.
    const el = fake(190, 240);
    focusStepElement(el, false, 800);
    expect(el.scrollIntoView).not.toHaveBeenCalled();
    expect(el.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("scrolls when the heading sits under the sticky header", () => {
    const el = fake(70, 120);
    focusStepElement(el, false, 800);
    expect(el.scrollIntoView).toHaveBeenCalled();
  });

  it("scrolls when the heading is at 100px, below the 128px margin", () => {
    // The threshold matches scroll-mt-32, so the "Step N of 4"
    // label above the heading also clears the header.
    const el = fake(100, 150);
    focusStepElement(el, false, 800);
    expect(el.scrollIntoView).toHaveBeenCalled();
  });

  it("does not scroll at the 128px boundary", () => {
    const el = fake(128, 178);
    focusStepElement(el, false, 800);
    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls when the bottom edge runs past the viewport", () => {
    const el = fake(700, 850);
    focusStepElement(el, false, 800);
    expect(el.scrollIntoView).toHaveBeenCalled();
  });
});
