import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// Batch 2a (typewriter removal): source-scan guards. The typewriter
// replayed on every open of a saved reading, so it must not come back
// under its old name or anywhere else. Same pattern as
// batch1-wiring.test.ts.
const src = (p: string) => readFileSync(p, "utf8").replace(/\s+/g, " ");

function allSourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules") allSourceFiles(p, out);
    } else if (/\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      // Test files are excluded: this guard itself names the component
      // it forbids, and a test mentioning it is not a reintroduction.
      out.push(p);
    }
  }
  return out;
}

describe("Batch 2a wiring guards", () => {
  it("no file under src/ imports or mentions TypewriterText", () => {
    const offenders = allSourceFiles("src").filter((p) => src(p).includes("TypewriterText"));
    expect(offenders).toEqual([]);
  });

  it("no script under scripts/ reads the deleted component file", () => {
    // scripts/charts-check.mjs used to read TypewriterText.tsx and
    // assert on its button; it now asserts on ReadingText instead.
    // The check is for the file path: the new assertion names the
    // component, and that mention is fine.
    const offenders = allSourceFiles("scripts").filter((p) => src(p).includes("TypewriterText.tsx"));
    expect(offenders).toEqual([]);
  });

  it("the reading page renders the interpretation statically, with no skip button copy", () => {
    const sections = src("src/app/reading/[id]/ReadingSections.tsx");
    expect(sections).toContain("ReadingText");
    expect(sections).not.toContain("TypewriterText");
    expect(sections).not.toContain("Show full reading");
  });
});
