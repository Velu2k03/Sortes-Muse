import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SpreadDiagram from "@/components/SpreadDiagram";
import { SPREADS } from "@/lib/tarot";

const celtic = SPREADS.find((s) => s.slug === "celtic-cross")!;
const quick = SPREADS.find((s) => s.slug === "quick-insight")!;
const three = SPREADS.find((s) => s.cards === 3)!;

describe("SpreadDiagram (Batch 4a: numbered card backs, no SVG wireframe)", () => {
  it("renders one card-back image per position, each with its number", () => {
    const html = renderToStaticMarkup(createElement(SpreadDiagram, { spread: celtic }));
    const imgs = html.match(/<img[^>]*>/g) ?? [];
    expect(imgs).toHaveLength(10);
    for (const img of imgs) {
      expect(img).toContain("card-back");
    }
    // Every position number 1-10 appears as a badge.
    for (let n = 1; n <= 10; n++) {
      expect(html).toContain(`>${n}<`);
    }
  });

  it("renders the 1-card and 3-card shapes the same way", () => {
    const one = renderToStaticMarkup(createElement(SpreadDiagram, { spread: quick }));
    expect((one.match(/<img[^>]*>/g) ?? []).length).toBe(1);
    expect(one).toContain(">1<");
    const triad = renderToStaticMarkup(createElement(SpreadDiagram, { spread: three }));
    expect((triad.match(/<img[^>]*>/g) ?? []).length).toBe(3);
    for (let n = 1; n <= 3; n++) {
      expect(triad).toContain(`>${n}<`);
    }
  });

  it("contains no SVG and no visible position-label text in the diagram itself", () => {
    const html = renderToStaticMarkup(createElement(SpreadDiagram, { spread: celtic }));
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("viewBox");
    // Labels live in the HTML legend beside the diagram, not here.
    // The aria-label deliberately names the positions for screen
    // readers, so strip it before checking the visible text.
    const visible = html.replace(/aria-label="[^"]*"/, "");
    expect(visible).not.toContain("Present");
    expect(visible).not.toContain("Challenge");
    expect(visible).not.toContain("Outcome");
  });

  it("sizes itself from the layout aspect ratio, never a fixed height", () => {
    const html = renderToStaticMarkup(createElement(SpreadDiagram, { spread: celtic }));
    expect(html).toContain("aspect-ratio:340 / 372");
    const triad = renderToStaticMarkup(createElement(SpreadDiagram, { spread: three }));
    expect(triad).toContain("aspect-ratio:300 / 190");
  });
});
