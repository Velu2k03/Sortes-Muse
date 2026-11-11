import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Batch 9: remove the dead xingchen model from the AI chain.
// OpenRouter returns 404 ("no longer available on OpenRouter") for
// xingchen-agi/xing4.0-29b-a4b:free, so it can never answer again.
// The 2026-11-11 production verification saw it 404 on every attempt
// and generation failed 3 times before succeeding. The chain is now
// 2 free models: openrouter/free, nvidia/nemotron-3-ultra-550b-a55b:free.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Batch 9: dead model removed", () => {
  it("the dead model slug appears nowhere in the chain or the tests", () => {
    for (const rel of ["src/lib/ai.ts", "src/lib/__tests__/ai.test.ts"]) {
      const file = src(rel);
      expect(file).not.toContain("xingchen-agi/xing4.0-29b-a4b:free");
    }
  });

  it("the default chain is the 2 free models, router first", () => {
    const ai = src("src/lib/ai.ts");
    expect(ai).toContain(
      '"openrouter/free,nvidia/nemotron-3-ultra-550b-a55b:free"'
    );
  });

  it("free models only: no paid model was added in its place", () => {
    const ai = src("src/lib/ai.ts");
    // The default chain string must contain only :free models.
    const match = ai.match(
      /OPENROUTER_DEFAULT_MODELS =\n\s*"([^"]+)"/
    );
    expect(match).not.toBeNull();
    for (const model of match![1].split(",")) {
      const slug = model.trim();
      // A free model is "openrouter/free" or ends with ":free".
      expect(slug === "openrouter/free" || slug.endsWith(":free")).toBe(true);
    }
  });
});
