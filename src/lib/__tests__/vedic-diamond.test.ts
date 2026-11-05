// Phase 4B (4.2d): the diamond geometry must tile the square and
// count whole signs from the Lagna, or the chart would misplace
// planets. Areas are exact: 4 centre diamonds of 20,000 plus 8
// corner triangles of 10,000 tile the 400x400 square (160,000).
import { describe, it, expect } from "vitest";
import {
  DIAMOND_SIZE,
  diamondCells,
  polygonArea,
  signIndexForHouse,
  planetsByHouse,
  SIGN_NAMES,
} from "@/lib/vedic-diamond";

describe("diamondCells", () => {
  it("has 12 houses, kendras 1/4/7/10 as diamonds, the rest triangles", () => {
    const cells = diamondCells();
    expect(cells.length).toBe(12);
    expect(cells.map((c) => c.house)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const c of cells) {
      expect(c.polygon.length).toBe(c.isKendra ? 4 : 3);
      expect(c.isKendra).toBe([1, 4, 7, 10].includes(c.house));
    }
  });
  it("tiles the whole square with no gaps or overlaps", () => {
    const cells = diamondCells();
    const total = cells.reduce((s, c) => s + polygonArea(c.polygon), 0);
    expect(total).toBe(DIAMOND_SIZE * DIAMOND_SIZE);
  });
  it("keeps every centroid inside the square, and all distinct", () => {
    const cells = diamondCells();
    const seen = new Set<string>();
    for (const c of cells) {
      expect(c.centroid.x).toBeGreaterThanOrEqual(0);
      expect(c.centroid.x).toBeLessThanOrEqual(DIAMOND_SIZE);
      expect(c.centroid.y).toBeGreaterThanOrEqual(0);
      expect(c.centroid.y).toBeLessThanOrEqual(DIAMOND_SIZE);
      seen.add(`${c.centroid.x},${c.centroid.y}`);
    }
    expect(seen.size).toBe(12);
  });
  it("puts the Lagna diamond at the top centre and house 7 opposite it", () => {
    const cells = diamondCells();
    expect(cells.find((c) => c.house === 1)?.centroid).toEqual({ x: 200, y: 100 });
    expect(cells.find((c) => c.house === 7)?.centroid).toEqual({ x: 200, y: 300 });
    expect(cells.find((c) => c.house === 4)?.centroid).toEqual({ x: 100, y: 200 });
    expect(cells.find((c) => c.house === 10)?.centroid).toEqual({ x: 300, y: 200 });
  });
});

describe("signIndexForHouse", () => {
  it("counts whole signs counter-clockwise from the Lagna", () => {
    // Lagna Aquarius (index 10): house 1 Aquarius, house 2 Pisces,
    // house 7 Leo (opposite), house 12 Capricorn.
    expect(SIGN_NAMES[signIndexForHouse(10, 1)]).toBe("Aquarius");
    expect(SIGN_NAMES[signIndexForHouse(10, 2)]).toBe("Pisces");
    expect(SIGN_NAMES[signIndexForHouse(10, 7)]).toBe("Leo");
    expect(SIGN_NAMES[signIndexForHouse(10, 12)]).toBe("Capricorn");
    expect(SIGN_NAMES[signIndexForHouse(0, 12)]).toBe("Pisces");
  });
});

describe("planetsByHouse", () => {
  it("groups planets by house and leaves out houseless ones", () => {
    const byHouse = planetsByHouse([
      { name: "sun", house: 1 },
      { name: "moon", house: 1 },
      { name: "mars", house: 7 },
      { name: "rahu", house: null },
    ]);
    expect(byHouse[1]).toEqual(["Sun", "Moon"]);
    expect(byHouse[7]).toEqual(["Mars"]);
    expect(byHouse[2]).toBeUndefined();
    expect(Object.values(byHouse).flat()).not.toContain("Rahu");
  });
});
