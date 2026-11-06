import { describe, expect, it } from "vitest";
import { calculateWestern } from "@/lib/charts";

// Phase E (item 4): natal aspects now carry applying/separating
// status from the same 24-hour-later comparison the retrograde flags
// use, and polar latitudes are flagged instead of presented as exact.

describe("calculateWestern — aspect state and polar flag", () => {
  const golden = {
    date: "1990-01-01",
    hour: 8,
    minute: 0,
    latitude: 14.6,
    longitude: 121.05,
  };

  it("pins the golden chart's exact longitudes", () => {
    const result = calculateWestern(golden);
    const sun = result.planets.find((p) => p.name === "Sun");
    const moon = result.planets.find((p) => p.name === "Moon");
    expect(sun?.longitude).toBeCloseTo(280.3038, 2);
    expect(moon?.longitude).toBeCloseTo(326.5485, 2);
    expect(result.ascendantLongitude).toBeCloseTo(303.8875, 2);
    expect(result.sunSign).toBe("Capricorn");
  });

  it("labels every aspect applying, separating, or steady, with both directions present", () => {
    const result = calculateWestern(golden);
    expect(result.aspects.length).toBeGreaterThan(0);
    for (const aspect of result.aspects) {
      expect(["applying", "separating", "steady"]).toContain(aspect.state);
    }
    const states = new Set(result.aspects.map((a) => a.state));
    expect(states.has("applying")).toBe(true);
    expect(states.has("separating")).toBe(true);
    // The Sun-Saturn conjunction closes over the day: Saturn is slow
    // and the Sun moves toward it.
    const sunSaturn = result.aspects.find(
      (a) => a.planet1 === "Sun" && a.planet2 === "Saturn" && a.label === "Conjunction"
    );
    expect(sunSaturn?.state).toBe("applying");
  });

  it("flags polar latitudes and clears the flag for ordinary ones", () => {
    expect(calculateWestern({ ...golden, latitude: 70 }).polar).toBe(true);
    expect(calculateWestern({ ...golden, latitude: -70 }).polar).toBe(true);
    expect(calculateWestern(golden).polar).toBe(false);
  });
});
