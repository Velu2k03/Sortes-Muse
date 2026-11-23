/**
 * Batch 2 broken paths (2026-11-23).
 *
 * B2: the transit report returned HTTP 503 on 4 of 4 live attempts
 * (0 credits spent). The 503 comes from generateChat returning null
 * (every model failed or failed validation). These tests reproduce the
 * validation step deterministically, with no API key: realistic
 * builder output for all three report types, fed through the same
 * anchorTerms + validateReportText the route uses. They show the
 * validator does NOT systematically reject transit text, so the live
 * failure is upstream (model availability, timeouts, or output shape
 * only visible in runtime logs). Until that is diagnosed, /reports
 * hides the transit option; the route and its type stay valid.
 *
 * B3: /deck promised love, career, and yes-or-no guidance that the
 * card data does not contain.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  buildTransitData,
  transitPromptLines,
  buildYearAheadData,
  yearAheadPromptLines,
  buildComparisonData,
  comparisonPromptLines,
} from "../reports";
import type { BirthInput } from "../reports";
import { anchorTerms, validateReportText } from "../output-validation";
import { OFFERED_REPORT_TYPES, DEFAULT_REPORT_TYPE, offeredReportType } from "../report-offer";

const src = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

const A: BirthInput = { date: "1995-03-14", hour: 9, minute: 30, latitude: 14.31, longitude: 121.11, gender: "male" };
const B: BirthInput = { date: "1997-08-02", hour: 18, minute: 5, latitude: 13.75, longitude: 100.5, gender: "female" };

// Same bands the route passes to validateReportText.
const TRANSIT_BAND = { minWords: 300, maxWords: 600 };
const YEAR_BAND = { minWords: 450, maxWords: 750 };

const FILLER =
  "This is an invitation to slow down and notice what is already moving, rather than a promise about what will happen. ";

/** Model-style prose: names two anchors, pads to roughly `words`
 *  words, and closes with the one gentle question the prompt asks for. */
function modelStyleText(anchorA: string, anchorB: string, words: number): string {
  const opening = `On this date, transit ${anchorA} meets your chart while the Moon moves through ${anchorB}. `;
  const closing = "What would it look like to meet this season with patience instead of urgency?";
  const fillerWords = FILLER.trim().split(/\s+/).length;
  const target = words - opening.split(/\s+/).length - closing.split(/\s+/).length;
  const repeats = Math.max(0, Math.round(target / fillerWords));
  return `${opening}\n\n${FILLER.repeat(repeats)}\n\n${closing}`;
}

const wordCount = (t: string) => t.trim().split(/\s+/).length;

describe("B2: transit report validation reproduction (no API key)", () => {
  const lines = transitPromptLines(buildTransitData(A, "2026-11-22"));
  const anchors = anchorTerms(lines);

  it("transit prompt lines yield plain, writable anchors (planets, signs, the date)", () => {
    expect(anchors.length).toBeGreaterThanOrEqual(5);
    expect(anchors).toContain("2026-11-22");
    expect(anchors).toContain("Sun");
    expect(anchors).toContain("Moon");
    // Panchanga terms and orb numbers are NOT anchors, so the model is
    // never required to echo tithi/nakshatra names or orb values.
    expect(anchors.some((a) => /tithi|nakshatra|yoga|karana|orb|\d+\.\d+/i.test(a))).toBe(false);
  });

  it("a realistic 300-550 word transit text with two anchors and a question validates", () => {
    const named = anchors.filter((a) => /^[A-Z]/.test(a));
    for (const words of [320, 420, 540]) {
      const text = modelStyleText(named[2] ?? "Mars", named[0] ?? "Sun", words);
      expect(wordCount(text)).toBeGreaterThanOrEqual(300);
      expect(wordCount(text)).toBeLessThanOrEqual(600);
      expect(validateReportText(text, { anchors, ...TRANSIT_BAND })).toBe(true);
    }
  });

  it("the validator still rejects what it should: no question, over the band, no anchors", () => {
    const ok = modelStyleText("Mars", "Taurus", 420);
    expect(validateReportText(ok.replace(/\?/g, "."), { anchors, ...TRANSIT_BAND })).toBe(false);
    expect(validateReportText(modelStyleText("Mars", "Taurus", 700), { anchors, ...TRANSIT_BAND })).toBe(false);
    const noAnchors = `${FILLER.repeat(20)} What now?`;
    expect(validateReportText(noAnchors, { anchors, ...TRANSIT_BAND })).toBe(false);
  });

  it("control: year-ahead validates the same way in its own band", () => {
    const yLines = yearAheadPromptLines(buildYearAheadData(A, 2027));
    const yAnchors = anchorTerms(yLines);
    expect(yAnchors).toContain("2027");
    const text = modelStyleText("Jupiter", "March", 600);
    expect(validateReportText(text, { anchors: yAnchors, ...YEAR_BAND })).toBe(true);
  });

  it("control: comparison validates the same way as transit", () => {
    const cLines = comparisonPromptLines(buildComparisonData(A, B));
    const cAnchors = anchorTerms(cLines);
    expect(cAnchors.length).toBeGreaterThanOrEqual(2);
    const text = modelStyleText("Venus", "Moon", 420);
    expect(validateReportText(text, { anchors: cAnchors, ...TRANSIT_BAND })).toBe(true);
  });
});

describe("B2: transit is not offered on /reports until the live 503 is fixed", () => {
  it("the offered list excludes transit and defaults to year-ahead", () => {
    expect(OFFERED_REPORT_TYPES).not.toContain("transit");
    expect(OFFERED_REPORT_TYPES).toEqual(["year-ahead", "comparison"]);
    expect(DEFAULT_REPORT_TYPE).toBe("year-ahead");
  });

  it("?type=transit (or junk) falls back to year-ahead; comparison still opens", () => {
    expect(offeredReportType("transit")).toBe("year-ahead");
    expect(offeredReportType(undefined)).toBe("year-ahead");
    expect(offeredReportType("nonsense")).toBe("year-ahead");
    expect(offeredReportType("comparison")).toBe("comparison");
    expect(offeredReportType("year-ahead")).toBe("year-ahead");
  });

  it("the page and client offer no transit segment and no transit promise", () => {
    const page = src("src/app/reports/page.tsx");
    const client = src("src/app/reports/ReportsClient.tsx");
    expect(page).not.toContain("a transit report for a chosen date");
    expect(page).toContain("offeredReportType(raw)");
    expect(client).not.toContain('{ value: "transit"');
    expect(client).toContain("OFFERED_REPORT_TYPES.map(");
    expect(client).toContain("initialType = DEFAULT_REPORT_TYPE");
    expect(client).not.toContain("<li>Transit report:");
  });

  it("the API route keeps transit valid (hidden, not deleted)", () => {
    const route = src("src/app/api/reports/generate/route.ts");
    expect(route).toContain('const TYPES: ReportType[] = ["transit", "year-ahead", "comparison"]');
    expect(route).toContain("buildTransitData(birth, targetDate)");
  });
});

describe("B3: /deck copy says only what the card data holds", () => {
  const layout = () => src("src/app/deck/layout.tsx");

  it("no love, career, or yes-or-no promise remains", () => {
    expect(layout()).not.toMatch(/love, career/);
    expect(layout()).not.toMatch(/yes-or-no guidance/);
  });

  it("the description names upright and reversed meanings and keywords, used for meta and social", () => {
    expect(layout()).toContain(
      '"Browse all 78 Rider-Waite tarot card meanings: upright and reversed meanings and keywords for every card in the deck."'
    );
    expect(layout()).toContain("description: DECK_DESCRIPTION,");
    expect(layout()).toContain('pageSocial({ title: "Card Meanings", description: DECK_DESCRIPTION, path: "/deck" })');
  });

  it("the card data really has keywords and upright/reversed meanings and nothing else claimed", () => {
    const cards = JSON.parse(src("src/data/cards.json")) as Array<Record<string, unknown>>;
    expect(cards).toHaveLength(78);
    for (const c of cards) {
      const k = c.keywords as Record<string, unknown>;
      expect(Object.keys(k).sort()).toEqual(["reversed", "upright"]);
      expect(Array.isArray(k.upright)).toBe(true);
      const m = c.meaning as Record<string, unknown>;
      expect(Object.keys(m).sort()).toEqual(["reversed", "upright"]);
      expect(c).not.toHaveProperty("love");
      expect(c).not.toHaveProperty("career");
    }
  });
});
