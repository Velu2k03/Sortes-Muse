import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReadingText from "@/components/ReadingText";
import { readingToPlainText } from "@/lib/readingMarkdown";

const report =
  "**The Year Ahead**\nA *quiet* start with **real** momentum.\n\n- Rest early\n- Plan in spring\n\n1. Begin\n2. Continue\n\n---\n\nClosing words.";

describe("shared reading renderer (D3)", () => {
  it("renders a report interpretation as h3/p/ul/ol/hr with no raw markers", () => {
    const html = renderToStaticMarkup(createElement(ReadingText, { text: report }));
    expect(html).toContain("<h3");
    expect(html).toMatch(/<ul[^>]*>[\s\S]*<li>[\s\S]*Rest[\s\S]*<\/li>[\s\S]*<li>[\s\S]*Plan[\s\S]*<\/li>[\s\S]*<\/ul>/);
    expect(html).toMatch(/<ol[^>]*>[\s\S]*<li>[\s\S]*Begin[\s\S]*<\/li>[\s\S]*<\/ol>/);
    expect(html).toContain("<hr");
    const textOnly = html.replace(/<[^>]+>/g, " ");
    expect(textOnly).not.toMatch(/\*|#|^\s*-\s|\b1\.\s|---/m);
  });

  it("plain-text export has no markers either", () => {
    const t = readingToPlainText(report);
    expect(t).not.toMatch(/\*|#|---/);
    expect(t).toContain("• Rest early\n• Plan in spring");
    expect(t).toContain("1. Begin\n2. Continue");
  });
});
