import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CardMeanings, Interpretation } from "@/app/reading/[id]/ReadingSections";
import type { Reading } from "@/lib/types";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

// ReadingText renders each word in its own <span>, so check the
// plain text (tags stripped), not the raw markup, for a sentence.
function plain(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

// A saved AI chart reading: no cards, a real interpretation.
// (onSaveChart in useChartsClient.ts saves cards [] with
// aiGenerated true and a non-empty interpretation.)
const chartReading: Reading = {
  id: "chart-1",
  createdAt: "2026-11-11T00:00:00.000Z",
  spreadSlug: "western-chart",
  spreadName: "Western chart",
  cards: [],
  interpretation: "The Sun in Leo lights up the year ahead.",
  aiGenerated: true,
  free: false,
};

const tarotReading: Reading = {
  id: "tarot-1",
  createdAt: "2026-11-11T00:00:00.000Z",
  spreadSlug: "quick-insight",
  spreadName: "Quick Insight",
  cards: [
    { cardId: "major-00", reversed: false, position: "Insight", positionKey: "insight" },
  ],
  interpretation: "The Fool steps forward with an open heart.",
  aiGenerated: true,
  free: false,
};

describe("Batch 6c wiring (layout)", () => {
  it("the spread detail puts the CTA directly under the title", () => {
    const flow = src("src/components/ReadingFlow.tsx");
    const cta = flow.indexOf("{isFreeAvailable ? (");
    const positions = flow.indexOf("The positions");
    const includes = flow.indexOf("What your reading includes");
    const disclaimer = flow.indexOf("Readings are for self-reflection");
    expect(cta).toBeGreaterThan(-1);
    expect(positions).toBeGreaterThan(-1);
    expect(includes).toBeGreaterThan(-1);
    // CTA first, then the disclaimer, then the details below it.
    expect(cta).toBeLessThan(disclaimer);
    expect(disclaimer).toBeLessThan(positions);
    expect(positions).toBeLessThan(includes);
    // The gate logic did not move with the layout.
    expect(flow).toContain("!authLoading &&");
    expect(flow).toContain("isFreeAvailableFor");
  });

  it("the reading page renders the interpretation first, the cards collapsed", () => {
    const client = src("src/app/reading/[id]/ReadingDetailClient.tsx");
    const interp = client.indexOf("<Interpretation");
    const meanings = client.indexOf("<CardMeanings");
    expect(interp).toBeGreaterThan(-1);
    expect(meanings).toBeGreaterThan(-1);
    expect(interp).toBeLessThan(meanings);

    const sections = src("src/app/reading/[id]/ReadingSections.tsx");
    // The interpretation is its own component, rendered first.
    expect(sections).toContain("export function Interpretation");
    expect(sections).toContain("Personalized interpretation");
    // The card blocks collapse into one details when there IS an
    // interpretation, and render expanded when there is none (they
    // ARE the content then).
    expect(sections).toContain("The cards and their meanings");
    expect(sections).toContain("hasInterpretation");
    expect(sections).toContain('<div className="mx-auto mt-10 max-w-3xl space-y-5">{blocks}</div>');
  });

  it("a saved AI chart reading renders no empty card box", () => {
    // Review B1: cards [] + a real interpretation used to render a
    // collapsed "The cards and their meanings (0)" box. The chart
    // interpretation is rendered by Interpretation, above this one.
    const html = renderToStaticMarkup(createElement(CardMeanings, { reading: chartReading }));
    expect(html).toBe("");
    expect(html).not.toContain("The cards and their meanings");
    const interp = renderToStaticMarkup(createElement(Interpretation, { reading: chartReading }));
    expect(plain(interp)).toContain("The Sun in Leo lights up the year ahead.");
  });

  it("a normal AI tarot reading renders the interpretation and one collapsed card section", () => {
    const interp = renderToStaticMarkup(createElement(Interpretation, { reading: tarotReading }));
    expect(plain(interp)).toContain("The Fool steps forward with an open heart.");
    const meanings = renderToStaticMarkup(createElement(CardMeanings, { reading: tarotReading }));
    expect(meanings).toContain("The cards and their meanings (1)");
    expect(meanings).toContain("<details");
    expect(meanings).toContain("The Fool");
  });

  it("/spreads is one compact row per spread, with a small diagram", () => {
    const spreads = src("src/app/spreads/SpreadsClient.tsx");
    expect(spreads).not.toContain("md:grid-cols-3");
    expect(spreads).toContain("space-y-4");
    expect(spreads).toContain("w-28 shrink-0");
    // The legend and the sample details survive the row layout.
    expect(spreads).toContain("Positions in this spread");
    expect(spreads).toContain("See a sample reading");
    // The gate logic and the picker anchor survive.
    expect(spreads).toContain("!authLoading &&");
    expect(spreads).toContain("spread-${s.slug}");
  });

  it("/oracles collapses the sample reading behind one tap", () => {
    expect(src("src/app/oracles/CreditsClient.tsx")).toContain(
      "<SampleReading collapsed",
    );
  });

  it("/methodology has a contents list and seven collapsed sections, cut nothing", () => {
    const page = src("src/app/methodology/page.tsx");
    expect(page).toContain('aria-label="On this page"');
    for (const slug of [
      "western-charts",
      "vedic-charts",
      "ziwei-charts",
      "known-limits",
      "ai-role",
      "horoscopes",
      "privacy",
    ]) {
      expect(page).toContain(`href="#${slug}"`);
      // The id sits on the <section> (its h2 is always visible);
      // the <details> inside it holds the content.
      expect(page).toContain(`<section id="${slug}"`);
      expect(page).toContain("Show the details");
    }
    // One distinctive line per section: the content was moved, not cut.
    expect(page).toContain("circular-natal-horoscope-js");
    expect(page).toContain("caelus 0.25.0");
    expect(page).toContain("iztro 2.6.3");
    expect(page).toContain("Polar Placidus");
    expect(page).toContain("never calculates a chart");
    expect(page).toContain("general sun-sign copy");
    expect(page).toContain("stored in the database");
    expect(page).toContain("MethodologyHashOpener");
  });

  it("the FAQ groups all 16 questions under four section headings", () => {
    const faq = src("src/app/faq/page.tsx");
    const groups = faq.match(/group: "([^"]+)"/g) ?? [];
    expect(groups).toHaveLength(16);
    const count = (name: string) =>
      groups.filter((g) => g === `group: "${name}"`).length;
    expect(count("Pricing and Oracles")).toBe(8);
    expect(count("Readings and Charts")).toBe(3);
    expect(count("Privacy and Data")).toBe(3);
    expect(count("Account")).toBe(2);

    const list = src("src/components/FaqList.tsx");
    // The sections render in a fixed order, and the jump nav groups
    // the links under the same headings.
    expect(list).toContain('"Pricing and Oracles"');
    expect(list).toContain('"Readings and Charts"');
    expect(list).toContain('"Privacy and Data"');
    expect(list).toContain('"Account"');
    expect(list).toContain("<section key={g.name}");
    // The details ids (slug of the question) did not change, so
    // existing anchors still work.
    expect(list).toContain("id={slug(f.q)}");
  });
});
