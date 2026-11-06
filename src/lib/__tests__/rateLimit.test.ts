import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, isRateLimited, recordRateLimit, resetRateLimits, RATE_LIMITS } from "@/lib/rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("allows up to max requests, then blocks", () => {
    const rule = { windowMs: 60_000, max: 3 };
    expect(checkRateLimit("k1", rule).allowed).toBe(true);
    expect(checkRateLimit("k1", rule).allowed).toBe(true);
    const third = checkRateLimit("k1", rule);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
    expect(checkRateLimit("k1", rule).allowed).toBe(false);
  });

  it("keeps separate budgets per key", () => {
    const rule = { windowMs: 60_000, max: 1 };
    expect(checkRateLimit("a", rule).allowed).toBe(true);
    expect(checkRateLimit("a", rule).allowed).toBe(false);
    expect(checkRateLimit("b", rule).allowed).toBe(true);
  });

  it("frees the budget after the window passes", async () => {
    const rule = { windowMs: 15, max: 1 };
    expect(checkRateLimit("w", rule).allowed).toBe(true);
    expect(checkRateLimit("w", rule).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 25));
    expect(checkRateLimit("w", rule).allowed).toBe(true);
  });

  it("peek/record lets a caller count only failures (login semantics)", () => {
    const rule = { windowMs: 60_000, max: 2 };
    expect(isRateLimited("f", rule)).toBe(false);
    recordRateLimit("f", rule);
    expect(isRateLimited("f", rule)).toBe(false);
    recordRateLimit("f", rule);
    expect(isRateLimited("f", rule)).toBe(true);
    // Peeking never records: a fresh key is still allowed.
    expect(isRateLimited("fresh", rule)).toBe(false);
    expect(checkRateLimit("fresh", rule).allowed).toBe(true);
  });

  it("resetRateLimits clears every bucket", () => {
    const rule = { windowMs: 60_000, max: 1 };
    expect(checkRateLimit("r", rule).allowed).toBe(true);
    expect(checkRateLimit("r", rule).allowed).toBe(false);
    resetRateLimits();
    expect(checkRateLimit("r", rule).allowed).toBe(true);
  });

  it("ships sane rules for the money/auth routes", () => {
    // A limit of 0 or a negative window would silently block (or never
    // block) a route, so pin the shipped rules to sane values.
    for (const rule of Object.values(RATE_LIMITS)) {
      expect(rule.max).toBeGreaterThan(0);
      expect(rule.windowMs).toBeGreaterThan(0);
    }
  });

  it("Phase 6: the AI/chart budgets match the old per-route maps", () => {
    // The six deleted per-route maps had these exact budgets; the
    // shared limiter must not silently tighten or loosen them.
    expect(RATE_LIMITS.aiGenerateIp).toEqual({ windowMs: 60 * 60_000, max: 20 });
    expect(RATE_LIMITS.aiFollowUpIp).toEqual({ windowMs: 60 * 60_000, max: 10 });
    expect(RATE_LIMITS.chartCalcIp).toEqual({ windowMs: 60 * 60_000, max: 20 });
    expect(RATE_LIMITS.chartGeocodeIp).toEqual({ windowMs: 60 * 60_000, max: 20 });
    expect(RATE_LIMITS.chartInterpretIp).toEqual({ windowMs: 60 * 60_000, max: 20 });
    expect(RATE_LIMITS.reportsGenerateIp).toEqual({ windowMs: 60 * 60_000, max: 20 });
  });

  it("Phase 6: the previously unrated routes have strict budgets", () => {
    expect(RATE_LIMITS.accountDeleteUser).toEqual({ windowMs: 60 * 60_000, max: 3 });
    expect(RATE_LIMITS.accountExportUser).toEqual({ windowMs: 60 * 60_000, max: 10 });
    expect(RATE_LIMITS.historySyncUser).toEqual({ windowMs: 60 * 60_000, max: 20 });
    expect(RATE_LIMITS.readIp).toEqual({ windowMs: 60_000, max: 60 });
  });
});
