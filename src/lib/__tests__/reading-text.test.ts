import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseReading } from "@/lib/readingMarkdown";
import { renderReadingBlocks } from "@/components/ReadingText";
import ReadingText from "@/components/ReadingText";

const text = "**Opening**\nThe Tower sits at your crossing.\n\n- one\n- two";

// Batch 2a: the word-by-word TypewriterText is gone. A saved reading
// used to replay it on every open (~18s for 600 words) and cut
// mid-sentence. The interpretation now renders in full, at once.
describe("ReadingText static rendering (Batch 2a)", () => {
  it("renders the full text at once, with no Show full reading button", () => {
    const html = renderToStaticMarkup(createElement(ReadingText, { text }));
    // Each word renders in its own <span>, so check the plain text,
    // not the raw markup, for the sentence.
    const plain = html.replace(/<[^>]+>/g, "");
    expect(plain).toContain("The Tower sits at your crossing.");
    expect(plain).toContain("one");
    expect(plain).toContain("two");
    expect(html).not.toContain("Show full reading");
    expect(html).not.toContain("<button");
    expect(html).not.toContain('role="button"');
  });

  it("renders real headings, paragraphs and list items", () => {
    const html = renderToStaticMarkup(createElement(ReadingText, { text }));
    expect(html).toContain("<h3");
    expect(html).toContain("<p");
    expect(html).toContain("<li");
    expect(html).not.toContain("role=");
  });

  it("the shared renderer still parses blocks the same way", () => {
    const html = renderToStaticMarkup(createElement("div", null, renderReadingBlocks(parseReading(text), 6)));
    expect(html).toContain("<h3");
    expect(html).toContain("<p");
    expect(html).not.toContain("role=");
  });
});
