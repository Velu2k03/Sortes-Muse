import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

// The bronze brand palette (Phase 1, 2026-11-15), retired by Velu's
// 2026-11-16 palette change. None of these hex values may appear
// anywhere in src (outside tests). The new palette lives in
// src/lib/brand.ts and in globals.css @theme.
const OLD_HEX = [
  "#b9975b", // old gold (bronze)
  "#d6be8a", // old bright gold
  "#0f1e36", // old navy
  "#0a1526", // old navydeep
  "#1a2a44", // old panel navy
  "#0b1424", // old ink
  "#faf6ec", // old cream
  "#e8d5a4", // old wordmark top stop
  "#9a7f45", // old wordmark / button bottom stop
  "#8a6d0a", // old light gold
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "__tests__") walk(full, out);
    } else if (/\.(tsx?|css)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("Phase 5 Batch 5.1 old-brand hex sweep", () => {
  it("has no old-brand hex anywhere in src (outside tests)", () => {
    const files = walk(path.resolve(process.cwd(), "src"));
    expect(files.length).toBeGreaterThan(50);
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8").toLowerCase();
      for (const hex of OLD_HEX) {
        if (text.includes(hex)) {
          offenders.push(`${path.relative(process.cwd(), file)}: ${hex}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("brand.ts holds the new palette and the share/email code uses it", () => {
    const brand = src("src/lib/brand.ts");
    expect(brand).toContain('navy: "#141b2e"');
    expect(brand).toContain('gold: "#d4af37"');
    expect(brand).toContain('goldBright: "#f4d03f"');
    expect(brand).toContain('cream: "#ede6d6"');
    expect(brand).toContain('panel: "#1a1f2e"');
    expect(brand).toContain('navyDeep: "#0f1424"');
    // The share story PNG and the win-back email read the palette from
    // brand.ts instead of hardcoding hex.
    expect(src("src/components/ShareReading.tsx")).toContain("BRAND");
    expect(src("src/app/charts/ChartSections.tsx")).toContain("BRAND");
    expect(src("src/lib/email.ts")).toContain("BRAND");
  });
});
