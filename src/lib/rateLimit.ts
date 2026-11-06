import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * One shared in-memory rate limiter for every route that needs one.
 * Single decision point: routes call checkRateLimit with a bucket key
 * and a rule from RATE_LIMITS, and return rateLimitExceeded() on 429.
 *
 * Phase 6: the six per-route in-memory maps that used to live in the
 * AI/chart routes (generate, follow-up, calculate, geocode,
 * interpret, reports/generate) are gone — every route below uses
 * this limiter, with the same budgets the maps had. If a route ever
 * needs its own bucket again, the reason must be written here, not
 * silently re-added as a local map.
 *
 * Best effort by design: the buckets live in process memory, so on a
 * multi-instance host each instance enforces its own budget. That is
 * enough to stop casual abuse and credential stuffing from one
 * client. A distributed store would be needed for a hard global cap;
 * that is out of scope for this phase.
 */
export interface RateLimitRule {
  /** Sliding window length in milliseconds. */
  windowMs: number;
  /** Max requests per key inside the window. */
  max: number;
}

export const RATE_LIMITS = {
  /** Generic auth traffic per IP (signup, verify-code, set-password). */
  authIp: { windowMs: 15 * 60_000, max: 20 },
  /** Login attempts per email: matches the old login route's 10/15min. */
  loginEmail: { windowMs: 15 * 60_000, max: 10 },
  /** Sign-in code requests per email: matches the old request-code 5/hr. */
  codeEmail: { windowMs: 60 * 60_000, max: 5 },
  /** Checkout initiation per IP. */
  checkoutIp: { windowMs: 10 * 60_000, max: 20 },
  /** Signed-in money reads/writes per IP (balance, transactions). */
  moneyIp: { windowMs: 60_000, max: 60 },
  /** AI tarot generation per IP (was the generate route's own map). */
  aiGenerateIp: { windowMs: 60 * 60_000, max: 20 },
  /** AI follow-ups per IP (was the follow-up route's own map). */
  aiFollowUpIp: { windowMs: 60 * 60_000, max: 10 },
  /** Chart calculation per IP: calculate, transits, vedic-transits,
      ziwei-stacks (was calculate's own map; the other three were
      unrated). Calculation is free and unsaved, so the budget is
      generous, but unbounded POSTs are still abuse surface. */
  chartCalcIp: { windowMs: 60 * 60_000, max: 20 },
  /** Geocoding lookups per IP (was the geocode route's own map). */
  chartGeocodeIp: { windowMs: 60 * 60_000, max: 20 },
  /** Chart interpretation per IP (was the interpret route's own map). */
  chartInterpretIp: { windowMs: 60 * 60_000, max: 20 },
  /** Report generation per IP (was the reports/generate own map). */
  reportsGenerateIp: { windowMs: 60 * 60_000, max: 20 },
  /** Generic signed-in reads per IP (report/journal lists, stats). */
  readIp: { windowMs: 60_000, max: 60 },
  /** Account deletion per user: destructive, so 3/hour is plenty. */
  accountDeleteUser: { windowMs: 60 * 60_000, max: 3 },
  /** Full-data export per user: a 100-reading JSON dump. */
  accountExportUser: { windowMs: 60 * 60_000, max: 10 },
  /** Guest journal sync per user: up to 100 readings per call. */
  historySyncUser: { windowMs: 60 * 60_000, max: 20 },
} as const satisfies Record<string, RateLimitRule>;

const buckets = new Map<string, number[]>();

/** Stamps inside the window for a key (pruned as a side effect). */
function liveStamps(key: string, rule: RateLimitRule): number[] {
  const now = Date.now();
  const stamps = (buckets.get(key) ?? []).filter((t) => now - t < rule.windowMs);
  buckets.set(key, stamps);
  return stamps;
}

/** True when the key is already at its budget, without recording a hit. */
export function isRateLimited(key: string, rule: RateLimitRule): boolean {
  return liveStamps(key, rule).length >= rule.max;
}

/** Records one hit against the key's budget. */
export function recordRateLimit(key: string, rule: RateLimitRule): void {
  const stamps = liveStamps(key, rule);
  stamps.push(Date.now());
  buckets.set(key, stamps);
}

export function checkRateLimit(
  key: string,
  rule: RateLimitRule
): { allowed: boolean; remaining: number } {
  if (isRateLimited(key, rule)) return { allowed: false, remaining: 0 };
  recordRateLimit(key, rule);
  return { allowed: true, remaining: rule.max - liveStamps(key, rule).length };
}

/** Test-only: drop every bucket. Never called from a route. */
export function resetRateLimits(): void {
  buckets.clear();
}

/** Best-effort client IP behind Vercel / a proxy. */
export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function rateLimitExceeded(): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    { status: 429 }
  );
}
