import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Phase 3 Batch 3.2 reveal control and honest wait", () => {
  const flow = src("src/app/intake/[slug]/useIntakeFlow.ts");
  const wait = src("src/components/ReadingWait.tsx");
  const waitCss = src("src/components/ReadingWait.css");
  const steps = src("src/app/intake/[slug]/IntakeSteps.tsx");

  it("drives the wait stages from real SSE events, not a timer", () => {
    // No interval timer anywhere in the flow.
    expect(flow).not.toContain("setInterval");
    expect(flow).not.toContain("lineTimer");
    expect(flow).not.toContain("2600");
    // Stage 0 is set when the request is sent.
    expect(flow).toContain("setProcessingLine(0);");
    // The model event moves to stage 1, first text to stage 2,
    // done to stage 3. A retry goes back to stage 1.
    expect(flow).toContain('setProcessingLine((line) => Math.max(line, 1));');
    expect(flow).toContain('setProcessingLine((line) => Math.max(line, 2));');
    expect(flow).toContain("setProcessingLine(3);");
    expect(flow).toContain("setProcessingLine(1);");
    // Codex P2: stage 1 is "Consulting the cards", not "Drawing
    // your cards", because the cards were already drawn. (The
    // trailing comma matches the array element, not the comment
    // that explains the rename.)
    expect(wait).toContain('"Consulting the cards",');
    expect(wait).not.toContain('"Drawing your cards",');
  });

  it("shows one honest indicator, the stage trace, not three", () => {
    // Neither loader is imported or rendered anymore. (The words
    // still appear in the explanatory comments; that is fine.)
    expect(wait).not.toContain('import ThoughtLine');
    expect(wait).not.toContain('import LatticeLoader');
    expect(wait).not.toContain("<ThoughtLine");
    expect(wait).not.toContain("<LatticeLoader");
    // The trace is the single indicator.
    expect(wait).toContain("reading-trace");
    expect(wait).toContain("StatusMark");
    // The elapsed stopwatch and the honest time estimate stay.
    expect(wait).toContain('role="timer"');
    expect(wait).toContain("up to about 3 minutes");
    // CodeRabbit: the stage is announced to screen readers. The
    // trace only changes aria-current, which a live region does
    // not announce, so hidden text carries the stage.
    expect(wait).toContain('className="sr-only"');
    expect(wait).toContain("PROCESSING_LINES[Math.min(activeStep");
  });

  it("has no dead LatticeLoader styles left in the wait CSS", () => {
    expect(waitCss).not.toContain("lattice-loader");
    expect(waitCss).not.toContain("lattice-wave");
    expect(waitCss).not.toContain("#d4af37");
    expect(waitCss).toContain(".reading-stopwatch");
  });

  it("keeps the slide-to-reveal ritual and shows the cost before the tap", () => {
    // Velu's decision (2026-11-16): the rituals stay.
    expect(steps).toContain("SlideCommit");
    expect(steps).toContain('label="✦ Reveal my reading"');
    expect(steps).toContain("onConfirm={beginGeneration}");
    // The cost is visible before the reveal tap.
    expect(steps).toContain("Free · your first Quick Insight");
    expect(steps).toContain("1 Oracle · only charged when your reading is ready");
    // CodeRabbit: the price is a live region, so a change from
    // free to paid is announced without moving focus. <output>
    // carries implicit status semantics.
    expect(steps).toContain("<output");
    // The SlideCommit colours are the brand hex, not the old gold.
    expect(steps).toContain('handleColor="#b9975b"');
    expect(steps).toContain('successColor="#b9975b"');
    expect(steps).toContain('trackColor="#1a2a44"');
    expect(steps).not.toContain('handleColor="#d4af37"');
    // CodeRabbit: the track label is full-strength gold, not 45%
    // opacity, so it reads at 5.24:1 on the track (was 2.14:1).
    const slide = src("src/components/SlideCommit.tsx");
    expect(slide).toContain("[color:var(--sc-ink)]");
    expect(slide).not.toContain("var(--sc-ink)_45%");
  });
});
