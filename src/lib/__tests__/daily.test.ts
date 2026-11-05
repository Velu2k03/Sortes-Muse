import { describe, it, expect } from "vitest";
import { dailyHoroscope, weeklyHoroscope } from "@/lib/daily";

// Phase 3 (3.9): no lucky colour / lucky number gimmicks. The
// horoscope is honest reflection text only: a per-sign theme and a
// reflection line, nothing dressed as fortune.
describe("dailyHoroscope / weeklyHoroscope", () => {
  it("returns only sign, date, theme, and reflection — no lucky fields", () => {
    const h = dailyHoroscope("Aries", "2026-11-05");
    expect(Object.keys(h).sort()).toEqual(["date", "reflection", "sign", "theme"]);
    expect(h.theme.length).toBeGreaterThan(0);
    expect(h.reflection.length).toBeGreaterThan(0);

    const w = weeklyHoroscope("Aries", "2026-11-05");
    expect(Object.keys(w).sort()).toEqual(["reflection", "sign", "theme", "weekStart"]);
    expect(w.theme.length).toBeGreaterThan(0);
    expect(w.reflection.length).toBeGreaterThan(0);
  });

  it("is deterministic for the same sign and date", () => {
    expect(dailyHoroscope("Leo", "2026-11-05")).toEqual(dailyHoroscope("Leo", "2026-11-05"));
  });
});
