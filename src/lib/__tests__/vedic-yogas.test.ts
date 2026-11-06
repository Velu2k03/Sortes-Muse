import { describe, expect, it } from "vitest";
import { calculateVedic, computeYogas } from "@/lib/vedic";

// Phase E (item 5): named yogas are computed from the sidereal D1
// sign map with caelus's classical rules, never invented by the
// model. Hand-built sign maps pin each rule; the golden chart pins
// the real output.

function planet(name: string, signIndex: number, degree = 10) {
  return { name, longitude: signIndex * 30 + degree };
}

describe("computeYogas — placement yogas", () => {
  it("finds Ruchaka when Mars is in its own sign in a kendra from the Ascendant", () => {
    const yogas = computeYogas(
      [planet("mars", 0), planet("sun", 4), planet("moon", 3), planet("mercury", 4), planet("jupiter", 6), planet("venus", 5), planet("saturn", 9)],
      10 // Aries Ascendant
    );
    expect(yogas.some((y) => y.name === "Ruchaka")).toBe(true);
    expect(yogas.some((y) => y.name === "Shasha")).toBe(true);
    expect(yogas.some((y) => y.name === "Gajakesari")).toBe(true);
    expect(yogas.some((y) => y.name === "Budha-Aditya")).toBe(true);
  });

  it("finds no Mahapurusha when the planet is dignified but not in a kendra", () => {
    const yogas = computeYogas(
      [planet("mars", 0), planet("sun", 4), planet("moon", 3), planet("mercury", 4), planet("jupiter", 6), planet("venus", 5), planet("saturn", 9)],
      40 // Taurus Ascendant: Mars in Aries is 12th, not a kendra
    );
    expect(yogas.some((y) => y.name === "Ruchaka")).toBe(false);
  });

  it("finds Chandra-Mangala when Moon and Mars share a sign", () => {
    const yogas = computeYogas(
      [planet("moon", 3), planet("mars", 3), planet("sun", 4), planet("mercury", 5), planet("jupiter", 6), planet("venus", 7), planet("saturn", 8)],
      100
    );
    expect(yogas.some((y) => y.name === "Chandra-Mangala")).toBe(true);
  });
});

describe("computeYogas — Kemadruma", () => {
  it("finds Kemadruma when no tara graha sits beside or with the Moon", () => {
    const yogas = computeYogas(
      [planet("moon", 1), planet("mars", 6), planet("mercury", 7), planet("jupiter", 8), planet("venus", 9), planet("saturn", 10), planet("sun", 0)],
      10
    );
    expect(yogas.some((y) => y.name === "Kemadruma")).toBe(true);
  });

  it("finds no Kemadruma when a planet sits in the sign after the Moon", () => {
    const yogas = computeYogas(
      [planet("moon", 1), planet("mars", 2), planet("mercury", 7), planet("jupiter", 8), planet("venus", 9), planet("saturn", 10), planet("sun", 0)],
      10
    );
    expect(yogas.some((y) => y.name === "Kemadruma")).toBe(false);
  });
});

describe("computeYogas — raja, dhana, yogakaraka", () => {
  it("finds a raja yoga when a kendra lord and a trikona lord associate", () => {
    // Aries Ascendant: Jupiter (9th lord, trikona) aspects Mars
    // (1st lord, kendra) by graha drishti.
    const yogas = computeYogas(
      [planet("sun", 4), planet("moon", 3), planet("mars", 0), planet("mercury", 4), planet("jupiter", 6), planet("venus", 5), planet("saturn", 9)],
      10
    );
    const raja = yogas.find((y) => y.kind === "raja");
    expect(raja).toBeDefined();
    expect(raja!.planets).toEqual(["Jupiter", "Mars"]);
    expect(raja!.via).toBe("aspect");
  });

  it("names the yogakaraka for a Sagittarius Ascendant", () => {
    const yogas = computeYogas(
      [planet("sun", 8), planet("moon", 10), planet("mars", 7), planet("mercury", 9), planet("jupiter", 2), planet("venus", 9), planet("saturn", 8)],
      280 // Sagittarius Ascendant
    );
    const yk = yogas.find((y) => y.kind === "yogakaraka");
    expect(yk).toBeDefined();
    expect(yk!.planets).toEqual(["Venus"]);
  });
});

describe("computeYogas — golden chart and unknown time", () => {
  it("pins the golden chart yogas: Mercury-Venus raja and dhana by conjunction, Venus yogakaraka, no placement yogas", () => {
    const result = calculateVedic({ date: "1990-01-01", hour: 8, latitude: 14.5995, longitude: 120.9842 });
    const names = result.yogas.map((y) => y.name);
    expect(names).toContain("Raja yoga (Mercury, Venus)");
    expect(names).toContain("Dhana yoga (Mercury, Venus)");
    expect(names).toContain("Yogakaraka: Venus");
    expect(result.yogas.filter((y) => y.kind === "placement")).toEqual([]);
    expect(result.yogas.some((y) => y.name === "Kemadruma")).toBe(false);
  });

  it("returns no yogas without a birth time, because kendras need the Lagna", () => {
    expect(computeYogas([planet("mars", 0)], null)).toEqual([]);
  });
});
