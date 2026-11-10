import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

/**
 * One shared in-memory rate limiter for every route that needs one.
 * Single decision point: routes call checkRateLimit with a bucket key
 * and a rule from RATE_LIMITS, and return rateLimitExceeded() on 429.
 *
 * Phase 6: the six per-route in-memory maps that used to live in the
 * AI/chart routes (generate, follow-up, calculate, geocode,
 * interpret, reports/generate) are gone: every route below uses
 * this limiter, with the same budgets the maps had. If a route ever
 * needs its own bucket again, the reason must be written here, not
 * silently re-added as a local map.
 *
 * Item 4: counts live in Upstash Redis when its env vars are set, so the
 * budget holds across Vercel instances; otherwise (local dev, tests) an
 * explicit in-memory store is used. If Upstash errors, the limiter fails
 * open to the in-memory store (see withFallback).
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
  /** Phase B (R12): failed logins per IP, in addition to the
      per-email limit. The per-email bucket alone lets an attacker
      rotate target emails freely from one IP; 30 failures per 15
      minutes per IP bounds that. Only failures count, as with the
      email bucket; a success does not consume the budget. */
  loginIp: { windowMs: 15 * 60_000, max: 30 },
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
  /** Chart calculation per IP — SHARED bucket: calculate, transits,
      vedic-transits, ziwei-stacks all use the same `chart-calc:`
      key, so the 20/hour budget is COMBINED across the four routes,
      not 20 each (was calculate's own map; the other three were
      unrated). Calculation is free and unsaved, so the budget is
      generous, but unbounded POSTs are still abuse surface. */
  chartCalcIp: { windowMs: 60 * 60_000, max: 20 },
  /** Geocoding lookups per IP (was the geocode route's own map). */
  chartGeocodeIp: { windowMs: 60 * 60_000, max: 20 },
  /** Chart interpretation per IP (was the interpret route's own map). */
  chartInterpretIp: { windowMs: 60 * 60_000, max: 20 },
  /** Report generation per IP (was the reports/generate own map). */
  reportsGenerateIp: { windowMs: 60 * 60_000, max: 20 },
  /** Generic signed-in reads per IP (report/journal lists, stats) —
      SHARED bucket: reports GET, reports/[id] GET/DELETE all use the
      same `reports-read:` key, so the 60/minute budget is combined
      across those routes, not 60 each. */
  readIp: { windowMs: 60_000, max: 60 },
  /** Account deletion per user: destructive, so 3/hour is plenty. */
  accountDeleteUser: { windowMs: 60 * 60_000, max: 3 },
  /** Full-data export per user: a 100-reading JSON dump. */
  accountExportUser: { windowMs: 60 * 60_000, max: 10 },
  /** Guest journal sync per user: up to 100 readings per call. */
  historySyncUser: { windowMs: 60 * 60_000, max: 20 },
  /** Phase B (R9): journal writes per user (PATCH/DELETE), shared
      bucket. These were the only authenticated write operations
      with no limit at all. 20/hour matches the sync budget; a user
      editing notes or deleting readings never legitimately exceeds
      it, and the sync bucket stays separate so a bulk sync cannot
      eat the write budget (or vice versa). */
  historyWriteUser: { windowMs: 60 * 60_000, max: 20 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Item 4: storage is pluggable. Production/Preview use Upstash Redis
 * (shared across Vercel instances); local dev and the test suite use
 * the in-memory store. The fallback is explicit (see getStore below).
 */
export interface LimiterStore {
  /** Hits inside the window for a key. */
  count(key: string, rule: RateLimitRule): Promise<number>;
  /** Records one hit unconditionally. */
  record(key: string, rule: RateLimitRule): Promise<void>;
  /** Records a hit only if under budget. Returns hits after the call. */
  tryRecord(key: string, rule: RateLimitRule): Promise<{ allowed: boolean; used: number }>;
}

export function createMemoryStore(): LimiterStore & { clear(): void } {
  const buckets = new Map<string, number[]>();
  const live = (key: string, rule: RateLimitRule): number[] => {
    const now = Date.now();
    const stamps = (buckets.get(key) ?? []).filter((t) => now - t < rule.windowMs);
    buckets.set(key, stamps);
    return stamps;
  };
  return {
    async count(key, rule) {
      return live(key, rule).length;
    },
    async record(key, rule) {
      live(key, rule).push(Date.now());
    },
    async tryRecord(key, rule) {
      const stamps = live(key, rule);
      if (stamps.length >= rule.max) return { allowed: false, used: stamps.length };
      stamps.push(Date.now());
      return { allowed: true, used: stamps.length };
    },
    clear() {
      buckets.clear();
    },
  };
}

/** The slice of the Upstash client the limiter uses (sorted-set window). */
export interface RedisPipeline {
  zremrangebyscore(key: string, min: number, max: number): RedisPipeline;
  zadd(key: string, entry: { score: number; member: string }): RedisPipeline;
  zcard(key: string): RedisPipeline;
  pexpire(key: string, ms: number): RedisPipeline;
  exec(): Promise<unknown[]>;
}
export interface RedisLike {
  pipeline(): RedisPipeline;
  zrem(key: string, member: string): Promise<unknown>;
}

const PREFIX = "rl:";

export function createRedisStore(redis: RedisLike): LimiterStore {
  const member = (now: number) => `${now}:${Math.random().toString(36).slice(2, 10)}`;
  return {
    async count(key, rule) {
      const now = Date.now();
      const out = await redis
        .pipeline()
        .zremrangebyscore(PREFIX + key, 0, now - rule.windowMs)
        .zcard(PREFIX + key)
        .exec();
      return Number(out[1]);
    },
    async record(key, rule) {
      const now = Date.now();
      await redis
        .pipeline()
        .zadd(PREFIX + key, { score: now, member: member(now) })
        .pexpire(PREFIX + key, rule.windowMs)
        .exec();
    },
    async tryRecord(key, rule) {
      // Add first, then count, so two instances racing at the boundary
      // cannot both slip under the budget; a denied hit is rolled back
      // so rejected requests do not extend the window.
      const now = Date.now();
      const m = member(now);
      const out = await redis
        .pipeline()
        .zremrangebyscore(PREFIX + key, 0, now - rule.windowMs)
        .zadd(PREFIX + key, { score: now, member: m })
        .zcard(PREFIX + key)
        .pexpire(PREFIX + key, rule.windowMs)
        .exec();
      const used = Number(out[2]);
      if (used > rule.max) {
        await redis.zrem(PREFIX + key, m);
        return { allowed: false, used: used - 1 };
      }
      return { allowed: true, used };
    },
  };
}

const memory = createMemoryStore();
let redisStore: LimiterStore | null | undefined;

/**
 * Explicit store choice. Upstash is used only when BOTH env vars are set
 * (names come from the Vercel Upstash integration; Redis.fromEnv() would
 * not find them). Otherwise the in-memory store is used on purpose, with
 * a one-time warning in production.
 */
function getStore(): LimiterStore {
  if (redisStore === undefined) {
    const url = process.env.UPSTASH_REDIS_REST_KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;
    if (url && token) {
      redisStore = createRedisStore(new Redis({ url, token }) as unknown as RedisLike);
    } else {
      redisStore = null;
      if (process.env.NODE_ENV === "production") {
        console.warn("[rateLimit] Upstash env vars missing: using per-instance in-memory limiter.");
      }
    }
  }
  return redisStore ?? memory;
}

/**
 * FAIL OPEN: if the shared store errors (Upstash outage, timeout), log
 * and serve the decision from the per-instance memory store instead.
 * A limiter outage must never lock every user out of sign-in; the
 * degraded mode is the old per-instance behaviour, never a hard deny.
 */
async function withFallback<T>(
  op: (s: LimiterStore) => Promise<T>,
  fallback: (s: LimiterStore) => Promise<T>
): Promise<T> {
  const store = getStore();
  if (store === memory) return fallback(memory);
  try {
    return await op(store);
  } catch (err) {
    console.error("[rateLimit] shared store failed, failing open to in-memory:", err);
    return fallback(memory);
  }
}

/** True when the key is already at its budget, without recording a hit. */
export async function isRateLimited(key: string, rule: RateLimitRule): Promise<boolean> {
  const n = await withFallback((s) => s.count(key, rule), (m) => m.count(key, rule));
  return n >= rule.max;
}

/** Records one hit against the key's budget. */
export async function recordRateLimit(key: string, rule: RateLimitRule): Promise<void> {
  await withFallback((s) => s.record(key, rule), (m) => m.record(key, rule));
}

export async function checkRateLimit(
  key: string,
  rule: RateLimitRule
): Promise<{ allowed: boolean; remaining: number }> {
  const r = await withFallback((s) => s.tryRecord(key, rule), (m) => m.tryRecord(key, rule));
  return { allowed: r.allowed, remaining: Math.max(0, rule.max - r.used) };
}

/** Test-only: drop every in-memory bucket. Never called from a route. */
export function resetRateLimits(): void {
  memory.clear();
}

/** Best-effort client IP behind Vercel / a proxy. */
export function clientIp(req: NextRequest): string {
  const vercel = req.headers.get("x-vercel-forwarded-for");
  if (vercel) {
    const ip = vercel.split(",")[0]?.trim();
    if (ip) return ip;
  }
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // Off Vercel we cannot know how many trusted hops sit in front of the
    // app, and the last entry is the only one a client cannot forge by
    // prepending, because every proxy appends. This may group users behind
    // one shared egress proxy into one bucket (over-grouping, the safe
    // direction for a limiter) rather than letting anyone bypass it.
    const parts = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
    const ip = parts[parts.length - 1];
    if (ip) return ip;
  }
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}

export function rateLimitExceeded(): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    { status: 429 }
  );
}
