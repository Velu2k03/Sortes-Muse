import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * One shared in-memory rate limiter for every money/auth route.
 * Single decision point: routes call checkRateLimit with a bucket key
 * and a rule from RATE_LIMITS, and return rateLimitExceeded() on 429.
 *
 * Best effort by design: the buckets live in process memory, so on a
 * multi-instance host each instance enforces its own budget. That is
 * the same guarantee the per-route maps this replaces already gave,
 * and it is enough to stop casual abuse and credential stuffing from
 * one client. A distributed store would be needed for a hard global
 * cap; that is out of scope for this phase.
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
  /** Post-payment claim attempts per IP. */
  claimIp: { windowMs: 60 * 60_000, max: 10 },
  /** Checkout initiation per IP. */
  checkoutIp: { windowMs: 10 * 60_000, max: 20 },
  /** Signed-in money reads/writes per IP (balance, transactions). */
  moneyIp: { windowMs: 60_000, max: 60 },
} as const satisfies Record<string, RateLimitRule>;

const buckets = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  rule: RateLimitRule
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const stamps = (buckets.get(key) ?? []).filter((t) => now - t < rule.windowMs);
  if (stamps.length >= rule.max) {
    buckets.set(key, stamps);
    return { allowed: false, remaining: 0 };
  }
  stamps.push(now);
  buckets.set(key, stamps);
  return { allowed: true, remaining: rule.max - stamps.length };
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
