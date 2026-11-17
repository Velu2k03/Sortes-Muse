import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

// Token-backed z-index (AGENTS.md self-check, 2026-11-17):
// hardcoded/arbitrary values are replaced with token-backed
// utilities. PR #152 did this for the pricing toggle buttons
// (z-[1] to z-1); the pre-existing z-[1] in BranchedMenu,
// GlideSelect, and SpecularButton was left out of scope there,
// and HoldButton and SpecularButton also carried z-[2] /
// z-[3]. This branch converts the remaining sites. Tailwind
// v4's z-index utility takes a bare number (z-<number>), so
// z-1, z-2, and z-3 are token-backed utilities, not invented
// tokens, and each keeps its exact stacking value, so the
// order is unchanged: HoldButton pulse z-0 < label z-2 <
// fill overlay z-3, SpecularButton canvas z-1 < content z-2,
// GlideSelect item z-1 above the gliding pill, BranchedMenu
// marker z-1 above the items. No visual change.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

// Every non-test source file under src/, following the
// Batch 6a walker (same as clsx-classnames.test.ts): recurse,
// skip __tests__ directories, skip *.test.ts / *.test.tsx
// files. Test files are excluded from the scan: the PR #152
// test names the banned pattern in its own assertion string.
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...sourceFiles(p));
    } else if (
      (p.endsWith(".ts") || p.endsWith(".tsx")) &&
      !p.endsWith(".test.ts") &&
      !p.endsWith(".test.tsx")
    ) {
      out.push(p);
    }
  }
  return out;
}

describe("token-backed z-index", () => {
  it("BranchedMenu marker uses token-backed z-1, never z-[1]", () => {
    const c = src("src/components/BranchedMenu.tsx");
    expect(c).toContain("absolute -top-px left-0 z-1 h-4 w-0.5");
    expect(c).not.toContain("z-[1]");
  });

  it("GlideSelect item uses token-backed z-1, never z-[1]", () => {
    const c = src("src/components/GlideSelect.tsx");
    expect(c).toContain("relative z-1 flex cursor-pointer items-center gap-2");
    expect(c).not.toContain("z-[1]");
  });

  it("HoldButton keeps its 0 < 2 < 3 stack with token-backed z-2 and z-3", () => {
    const c = src("src/components/HoldButton.tsx");
    expect(c).toContain("hb-label relative z-2 grid place-items-center");
    expect(c).toContain("pointer-events-none absolute inset-0 z-3");
    expect(c).not.toContain("z-[2]");
    expect(c).not.toContain("z-[3]");
  });

  it("SpecularButton keeps canvas z-1 below content z-2, both token-backed", () => {
    const c = src("src/components/SpecularButton.tsx");
    expect(c).toContain("pointer-events-none absolute -inset-6 z-1 block");
    expect(c).toContain("relative z-2 inline-flex items-center gap-[inherit]");
    expect(c).not.toContain("z-[1]");
    expect(c).not.toContain("z-[2]");
  });

  it("no arbitrary z-[...] z-index remains site-wide", () => {
    const offenders = sourceFiles(path.resolve(process.cwd(), "src"))
      .filter((f) => /z-\[/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(process.cwd(), f));
    expect(offenders).toEqual([]);
  });
});
