// North Indian diamond (rasi) chart geometry. Pure functions, no DOM.
// The chart is a 400x400 square: both diagonals plus the diamond
// joining the edge midpoints cut it into 12 compartments, 4 centre
// diamonds (houses 1, 4, 7, 10) and 8 corner triangles. House 1
// (Lagna) is the top diamond; houses run counter-clockwise from it,
// which is the standard North Indian order. Signs are whole-sign:
// house h holds sign (lagna + h - 1) mod 12. Planets sit in their
// computed house; a planet with no house (unknown birth time) is not
// placed, and the caller must say the diamond is withheld then.
export const DIAMOND_SIZE = 400;

export type Point = { x: number; y: number };

export interface DiamondCell {
  house: number;
  polygon: Point[];
  centroid: Point;
  isKendra: boolean;
}

const T: Point = { x: 200, y: 0 };
const R: Point = { x: 400, y: 200 };
const BO: Point = { x: 200, y: 400 };
const L: Point = { x: 0, y: 200 };
const O: Point = { x: 200, y: 200 };
const A: Point = { x: 0, y: 0 };
const B: Point = { x: 400, y: 0 };
const C: Point = { x: 400, y: 400 };
const D: Point = { x: 0, y: 400 };
const P_TR: Point = { x: 300, y: 100 };
const P_BR: Point = { x: 300, y: 300 };
const P_BL: Point = { x: 100, y: 300 };
const P_TL: Point = { x: 100, y: 100 };

const POLYGONS: Record<number, Point[]> = {
  1: [T, P_TR, O, P_TL],
  2: [A, T, P_TL],
  3: [A, L, P_TL],
  4: [L, P_TL, O, P_BL],
  5: [D, L, P_BL],
  6: [D, P_BL, BO],
  7: [BO, P_BL, O, P_BR],
  8: [C, BO, P_BR],
  9: [C, R, P_BR],
  10: [R, P_TR, O, P_BR],
  11: [B, R, P_TR],
  12: [B, T, P_TR],
};

function centroidOf(polygon: Point[]): Point {
  const x = polygon.reduce((s, p) => s + p.x, 0) / polygon.length;
  const y = polygon.reduce((s, p) => s + p.y, 0) / polygon.length;
  return { x, y };
}

/** The 12 fixed house compartments, house 1 first. */
export function diamondCells(): DiamondCell[] {
  return Object.entries(POLYGONS).map(([house, polygon]) => ({
    house: Number(house),
    polygon,
    centroid: centroidOf(polygon),
    isKendra: [1, 4, 7, 10].includes(Number(house)),
  }));
}

/** Shoelace area, for the coverage test: the 12 cells tile the square. */
export function polygonArea(polygon: Point[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return Math.abs(sum) / 2;
}

export const SIGN_ABBR = ["Ari", "Tau", "Gem", "Can", "Leo", "Vir", "Lib", "Sco", "Sag", "Cap", "Aqu", "Pis"];
export const SIGN_NAMES = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

/** Sign (0-based index) of a house, counting whole signs from the Lagna. */
export function signIndexForHouse(lagnaSignIndex: number, house: number): number {
  return (((lagnaSignIndex + house - 1) % 12) + 12) % 12;
}

export const PLANET_ABBR: Record<string, string> = {
  sun: "Sun",
  moon: "Moon",
  mercury: "Merc",
  venus: "Venus",
  mars: "Mars",
  jupiter: "Jup",
  saturn: "Sat",
  rahu: "Rahu",
  ketu: "Ketu",
};

/** Planets grouped by house. Planets with no house are left out:
    the diamond cannot place them, and the caller says so. */
export function planetsByHouse(
  planets: Array<{ name: string; house: number | null }>
): Record<number, string[]> {
  const byHouse: Record<number, string[]> = {};
  for (const p of planets) {
    if (p.house === null || p.house < 1 || p.house > 12) continue;
    const label = PLANET_ABBR[p.name.toLowerCase()] ?? p.name;
    (byHouse[p.house] ??= []).push(label);
  }
  return byHouse;
}
