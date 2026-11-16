/**
 * UX audit Phase 2, F30 (guides).
 * Four guide cards all said "Read the guide", identical link text
 * to four different destinations. Each link now names its guide.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("F30 guide links name their guide", () => {
  it("each guide card link reads Read: <title>", () => {
    const guides = src("src/components/GuidesSearch.tsx");
    expect(guides).toContain("Read: {g.title}");
    expect(guides).not.toContain("Read the guide");
  });
});
