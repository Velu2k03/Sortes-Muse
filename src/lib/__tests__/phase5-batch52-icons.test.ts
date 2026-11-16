import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");
const pub = (rel: string) => path.resolve(process.cwd(), "public", rel);

describe("Phase 5 Batch 5.2 favicon and icons", () => {
  it("has the full icon set, regenerated from the locked logo", () => {
    const files = [
      "favicon-16x16.png",
      "favicon-32x32.png",
      "favicon.ico",
      "apple-touch-icon.png",
      "icon.svg",
      "og-image.jpg",
      "icons/icon-192.png",
      "icons/icon-512.png",
      "icons/icon-192.webp",
      "icons/icon-512.webp",
      "icons/icon-maskable-192.png",
      "icons/icon-maskable-512.png",
      "icons/icon-maskable-192.webp",
      "icons/icon-maskable-512.webp",
    ];
    for (const file of files) {
      expect(existsSync(pub(file)), file).toBe(true);
    }
  });

  it("the icon SVG uses the new brand colours, not the old gold", () => {
    const svg = src("public/icon.svg");
    expect(svg).toContain("#d4af37");
    expect(svg).toContain("#f4d03f");
    expect(svg).toContain("#0f1424");
    expect(svg).not.toContain("#b9975b");
    expect(svg).not.toContain("#d6be8a");
    expect(svg).not.toContain("#0a1526");
    expect(svg).not.toContain("#0a0e1a");
  });

  it("layout references the new og-image and the icon files", () => {
    const layout = src("src/app/layout.tsx");
    expect(layout).toContain("/og-image.jpg?v=4");
    expect(layout).toContain("/favicon-16x16.png");
    expect(layout).toContain("/favicon-32x32.png");
    expect(layout).toContain("/apple-touch-icon.png");
    expect(layout).toContain("/favicon.ico");
    // Viewport theme colour is the new navydeep.
    expect(layout).toContain("themeColor: BRAND.navyDeep");
  });

  it("the manifest aligns to the new theme colours", () => {
    const manifest = src("src/app/manifest.ts");
    expect(manifest).toContain("background_color: BRAND.navyDeep");
    expect(manifest).toContain("theme_color: BRAND.navyDeep");
    expect(manifest).toContain("/icons/icon-192.png");
    expect(manifest).toContain("/icons/icon-512.png");
  });
});
