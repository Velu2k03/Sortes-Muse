import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = (p: string) => readFileSync(p, "utf8");

// Batch 4a: the diagram is numbered card backs, not an SVG wireframe.
describe("Batch 4a wiring", () => {
  it("SpreadDiagram contains no SVG, no viewBox, no labelLines", () => {
    const diagram = src("src/components/SpreadDiagram.tsx");
    expect(diagram).not.toContain("<svg");
    expect(diagram).not.toContain("viewBox");
    expect(diagram).not.toContain("labelLines");
    expect(diagram).toContain("CARD_BACK");
  });

  it("neither caller squeezes the diagram with a fixed height or narrow width", () => {
    const spreads = src("src/app/spreads/SpreadsClient.tsx");
    expect(spreads).not.toContain("h-[22rem]");
    expect(spreads).not.toContain('"h-36"');
    const flow = src("src/components/ReadingFlow.tsx");
    expect(flow).not.toContain("w-40 shrink-0");
  });

  it("the wheel carries no false sideways-scroll caption", () => {
    // Batch 4b: the wheel SVG scales to its container, so nothing
    // scrolls. The old caption said otherwise on small screens.
    const wheel = src("src/components/WesternWheel.tsx");
    expect(wheel).not.toContain("Scroll sideways to see the full wheel");
    expect(wheel).not.toContain("scroll sideways to see the full wheel");
  });

  it("the /spreads positions legend is numbered to match the diagram badges", () => {
    // Batch 4a review: the diagram shows numbers only, so the
    // legend is the only place tying a number to a position. The
    // block between the summary and </details> must be a numbered
    // list with an explicit index.
    const spreads = src("src/app/spreads/SpreadsClient.tsx");
    const start = spreads.indexOf("Positions in this spread");
    const block = spreads.slice(start, spreads.indexOf("</details>", start));
    expect(block).toContain("<ol");
    expect(block).toContain("{i + 1}");
  });

  it("the shared OG image URL is versioned so scrapers re-fetch it", () => {
    // Batch 4c: the old og-image.jpg was an empty frame cached by
    // scrapers; ?v=2 forces a re-scrape of the new image.
    expect(src("src/lib/seo.ts")).toContain('"/og-image.jpg?v=2"');
    expect(src("src/app/layout.tsx")).toContain('"/og-image.jpg?v=2"');
  });
});

// Batch 4d: each of the 7 routes that inherited the generic homepage
// OG block now defines its own OG/Twitter. Six use pageSocial; the
// 404 uses inline openGraph/twitter with no url (a 404 has no
// canonical URL, and pageSocial always sets one).
describe("Batch 4d wiring", () => {
  const viaPageSocial = [
    "src/app/reading/[id]/page.tsx",
    "src/app/account/page.tsx",
    "src/app/intake/[slug]/page.tsx",
    "src/app/offline/page.tsx",
    "src/app/reports/[id]/page.tsx",
    "src/app/journal/page.tsx",
  ];
  it.each(viaPageSocial)("%s uses pageSocial", (p) => {
    expect(src(p)).toContain("pageSocial");
  });

  it("src/app/not-found.tsx defines its own openGraph/twitter with no url", () => {
    const notFound = src("src/app/not-found.tsx");
    expect(notFound).toContain("openGraph");
    expect(notFound).toContain("twitter");
    expect(notFound).not.toContain("pageSocial");
  });
});
