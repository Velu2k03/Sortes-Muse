import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseReading } from "@/lib/readingMarkdown";
import { renderReadingBlocks } from "@/components/ReadingText";
import TypewriterText from "@/components/TypewriterText";

const text = "**Opening**\nThe Tower sits at your crossing.\n\n- one\n- two";

describe("TypewriterText accessibility (D1)", () => {
  it("renders real headings and a native Show full reading button, no role=button wrapper", () => {
    const html = renderToStaticMarkup(createElement(TypewriterText, { text: text, speed: 1 }));
    // SSR is the first, mid-reveal frame (count 0): button visible, no wrapper role.
    expect(html).not.toContain('role="button"');
    expect(html).toContain("<button");
    expect(html).toContain("Show full reading");
  });

  it("partially revealed blocks are real h3/p/li elements", () => {
    const html = renderToStaticMarkup(createElement("div", null, renderReadingBlocks(parseReading(text), 6)));
    expect(html).toContain("<h3");
    expect(html).toContain("<p");
    expect(html).not.toContain("role=");
  });
});
