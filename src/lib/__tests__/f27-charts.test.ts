/**
 * UX audit Phase 2, F27 (charts).
 * Developer-speak in a label ("free, no key"), a time field whose
 * empty state shows no pattern, and an ambiguous subhead ("first
 * per system free"). Plain words, and the pattern shown as an
 * example.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("F27 charts speak plainly", () => {
  it("the birthplace label has no developer-speak", () => {
    const charts = src("src/app/charts/ChartSections.tsx");
    expect(charts).toContain("Birthplace: search a place name");
    expect(charts).not.toContain("(free, no key)");
    expect(charts).not.toContain("no key");
  });

  it("the time helper shows the pattern as an example", () => {
    const charts = src("src/app/charts/ChartSections.tsx");
    // A native type="time" input has no settable placeholder (the
    // browser renders "--:--"), so the pattern goes in the helper
    // text next to the field, not in a placeholder attribute.
    expect(charts).toContain("Type the time as HH:MM, e.g. 08:00");
    expect(charts).toContain('type="time"');
  });

  it("the subhead says plainly what is free", () => {
    const charts = src("src/app/charts/ChartSections.tsx");
    // The subhead wraps across source lines, so compare on
    // whitespace-collapsed text.
    const flat = charts.replace(/\s+/g, " ");
    // Phase 7 (7.3): shortened to one line.
    expect(flat).toContain(
      "First interpretation per system is free, then 1 Oracle."
    );
    expect(charts).not.toContain("first per system free");
  });
});
