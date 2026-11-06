// Ashtakavarga: unreduced Bhinnashtakavarga (BAV) per planet and the
// Sarvashtakavarga (SAV). Pure sign math on sidereal longitudes, so
// it is testable without an engine. No Trikona/Ekadhipatya
// reductions, no Shodhya Pinda, no Kaksha, no Lagna table, no
// Rahu/Ketu: the classical unreduced system only.
//
// Tables: the benefic places each reference point (the seven grahas
// plus the Lagna) gives to each planet, counted inclusively from the
// reference point's sign. Base tables follow B.V. Raman, Hindu
// Predictive Astrology Ch. XXVI, cross-checked against Patel/Aiyar
// (1957) and Saravali Ch. 53. Three entries follow the BPHS
// recension as published by Astro Clock AI (Kannan, Fundamentals of
// Hindu Astrology Ch. XXXII, checked against BPHS Ch. 66):
//   - Moon's table: the 9th from the Moon instead of the 9th from
//     Mars (BPHS Ch. 66), and the 2nd from Jupiter instead of the
//     12th (the Moon-from-Jupiter row is the Brihat-jataka lineage
//     variant; the Kannan/BPHS figure is used here).
//   - Venus's table: the 4th from Mars instead of the 5th (BPHS).
// The tables are verified, not trusted: the full 84-cell grid they
// produce for the published sample chart (14 Aug 1994, 06:42,
// Ahmedabad; Leo rising) matches Astro Clock AI's published grid
// cell for cell, and the column sums are the fixed totals
// 48/49/39/54/56/52/39 = 337. See
// src/lib/__tests__/ashtakavarga.test.ts.

export const ASHTAKAVARGA_PLANETS = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"] as const;
export type AshtakavargaPlanet = (typeof ASHTAKAVARGA_PLANETS)[number];

type RefPoints = Record<string, number[]>;

const TABLES: Record<AshtakavargaPlanet, RefPoints> = {
  sun: {
    sun: [1, 2, 4, 7, 8, 9, 10, 11],
    moon: [3, 6, 10, 11],
    mars: [1, 2, 4, 7, 8, 9, 10, 11],
    mercury: [3, 5, 6, 9, 10, 11, 12],
    jupiter: [5, 6, 9, 11],
    venus: [6, 7, 12],
    saturn: [1, 2, 4, 7, 8, 9, 10, 11],
    lagna: [3, 4, 6, 10, 11, 12],
  },
  moon: {
    sun: [3, 6, 7, 8, 10, 11],
    moon: [1, 3, 6, 7, 9, 10, 11],
    mars: [2, 3, 5, 6, 10, 11],
    mercury: [1, 3, 4, 5, 7, 8, 10, 11],
    jupiter: [1, 2, 4, 7, 8, 10, 11],
    venus: [3, 4, 5, 7, 9, 10, 11],
    saturn: [3, 5, 6, 11],
    lagna: [3, 6, 10, 11],
  },
  mars: {
    sun: [3, 5, 6, 10, 11],
    moon: [3, 6, 11],
    mars: [1, 2, 4, 7, 8, 10, 11],
    mercury: [3, 5, 6, 11],
    jupiter: [6, 10, 11, 12],
    venus: [6, 8, 11, 12],
    saturn: [1, 4, 7, 8, 9, 10, 11],
    lagna: [1, 3, 6, 10, 11],
  },
  mercury: {
    sun: [5, 6, 9, 11, 12],
    moon: [2, 4, 6, 8, 10, 11],
    mars: [1, 2, 4, 7, 8, 9, 10, 11],
    mercury: [1, 3, 5, 6, 9, 10, 11, 12],
    jupiter: [6, 8, 11, 12],
    venus: [1, 2, 3, 4, 5, 8, 9, 11],
    saturn: [1, 2, 4, 7, 8, 9, 10, 11],
    lagna: [1, 2, 4, 6, 8, 10, 11],
  },
  jupiter: {
    sun: [1, 2, 3, 4, 7, 8, 9, 10, 11],
    moon: [2, 5, 7, 9, 11],
    mars: [1, 2, 4, 7, 8, 10, 11],
    mercury: [1, 2, 4, 5, 6, 9, 10, 11],
    jupiter: [1, 2, 3, 4, 7, 8, 10, 11],
    venus: [2, 5, 6, 9, 10, 11],
    saturn: [3, 5, 6, 12],
    lagna: [1, 2, 4, 5, 6, 7, 9, 10, 11],
  },
  venus: {
    sun: [8, 11, 12],
    moon: [1, 2, 3, 4, 5, 8, 9, 11, 12],
    mars: [3, 4, 6, 9, 11, 12],
    mercury: [3, 5, 6, 9, 11],
    jupiter: [5, 8, 9, 10, 11],
    venus: [1, 2, 3, 4, 5, 8, 9, 10, 11],
    saturn: [3, 4, 5, 8, 9, 10, 11],
    lagna: [1, 2, 3, 4, 5, 8, 9, 11],
  },
  saturn: {
    sun: [1, 2, 4, 7, 8, 10, 11],
    moon: [3, 6, 11],
    mars: [3, 5, 6, 10, 11, 12],
    mercury: [6, 8, 9, 10, 11, 12],
    jupiter: [5, 6, 11, 12],
    venus: [6, 11, 12],
    saturn: [3, 5, 6, 11],
    lagna: [1, 3, 4, 6, 10, 11],
  },
};

// The fixed per-planet totals. A complete chart always sums to 337;
// the golden test asserts this on the sample grid, and the result
// carries the total so the UI can show the checksum.
export const ASHTAKAVARGA_TOTALS: Record<AshtakavargaPlanet, number> = {
  sun: 48,
  moon: 49,
  mars: 39,
  mercury: 54,
  jupiter: 56,
  venus: 52,
  saturn: 39,
};
export const ASHTAKAVARGA_GRAND_TOTAL = 337;

export interface AshtakavargaResult {
  // bav[planet][houseIndex 0-11]: bindus in the 1st to 12th house.
  bav: Record<AshtakavargaPlanet, number[]>;
  // sav[houseIndex 0-11]: the Sarvashtakavarga per house.
  sav: number[];
  total: number;
  // Each planet's own bindus in the sign it occupies at birth, the
  // cell Saravali Ch. 54 reads first (4 is the neutral point).
  natalBindus: Record<AshtakavargaPlanet, number>;
}

// Houses need the Lagna, so without a birth time there is no
// Ashtakavarga: the function returns null instead of a noon-derived
// grid presented as a chart.
export function computeAshtakavarga(
  planets: Array<{ name: string; longitude: number }>,
  ascendantLongitude: number | null
): AshtakavargaResult | null {
  if (ascendantLongitude === null) return null;
  const signIndex = (lon: number) => Math.floor((((lon % 360) + 360) % 360) / 30);
  const signs: Record<string, number> = {};
  for (const p of planets) signs[p.name.toLowerCase()] = signIndex(p.longitude);
  const lagna = signIndex(ascendantLongitude);
  const refs: Record<string, number> = { ...signs, lagna };
  const bav = {} as Record<AshtakavargaPlanet, number[]>;
  for (const planet of ASHTAKAVARGA_PLANETS) {
    const table = TABLES[planet];
    const row: number[] = [];
    for (let h = 0; h < 12; h++) {
      const sign = (lagna + h) % 12;
      let count = 0;
      for (const [ref, places] of Object.entries(table)) {
        const refSign = refs[ref];
        if (typeof refSign !== "number") continue;
        const houseFromRef = ((sign - refSign) % 12 + 12) % 12 + 1;
        if (places.includes(houseFromRef)) count++;
      }
      row.push(count);
    }
    bav[planet] = row;
  }
  const sav = Array.from({ length: 12 }, (_, h) =>
    ASHTAKAVARGA_PLANETS.reduce((sum, p) => sum + bav[p][h], 0)
  );
  const total = sav.reduce((a, b) => a + b, 0);
  const natalBindus = {} as Record<AshtakavargaPlanet, number>;
  for (const planet of ASHTAKAVARGA_PLANETS) {
    const house = ((signs[planet] - lagna) % 12 + 12) % 12;
    natalBindus[planet] = bav[planet][house];
  }
  return { bav, sav, total, natalBindus };
}
