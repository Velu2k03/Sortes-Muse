import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { Redis } from "@upstash/redis";
import { Ratelimit, type Duration } from "@upstash/ratelimit";

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
 * Item 4/C4: counts live in Upstash Redis (via @upstash/ratelimit) when its env vars are set, so the
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
  /** Batch D (A1) / Point 4: guest free Quick Insights per IP per day. The
      product rule is 1 free reading per device (signed cookie), which stops
      casual repeats; this cap only has to stop scripts that never send the
      cookie. Carrier-grade NAT puts many real users behind one IP, so the
      cap is high: 50/day still cuts a script from ~480/day (the hourly
      aiGenerateIp budget alone) to 50, while a shared IP with dozens of
      real users is unlikely to reach it. Checked before the model call and
      recorded only after a successful generation, so failures cost nothing. */
  guestFreeIp: { windowMs: 24 * 60 * 60_000, max: 50 },
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

/** The slice of an @upstash/ratelimit instance the store uses. */
export interface LimiterLike {
  limit(identifier: string): Promise<{ success: boolean; remaining: number; reason?: string }>;
  getRemaining(identifier: string): Promise<{ remaining: number; reset?: number }>;
}

/**
 * Windows in the largest exact unit @upstash/ratelimit accepts:
 * 60_000 -> "1 m", 15 min -> "15 m", 60 min -> "60 m", 24 h -> "1 d".
 */
export function durationString(windowMs: number): string {
  const DAY = 86_400_000;
  if (windowMs % DAY === 0) return `${windowMs / DAY} d`;
  if (windowMs % 60_000 === 0) return `${windowMs / 60_000} m`;
  if (windowMs % 1000 === 0) return `${windowMs / 1000} s`;
  return `${windowMs} ms`;
}

/**
 * C1: every key is prefixed per deployment environment, so Preview and
 * Production never share buckets. Since 2026-11-14 (Point 8, Option A)
 * they also live in TWO separate Upstash stores: Production uses the
 * Vercel-managed `sortes-rate-limit` store, Preview uses the Personal
 * account `sortes-rate-limit-preview` store. The prefix is now
 * redundant, but it is kept on purpose: it protects against a future
 * single-store regression (see D6 in batch-D-claude-miss-check.md).
 * Keys are `rl:<env>:<key>` (was `rl:<key>`); old keys expire via TTL.
 */
export function rateLimitPrefix(): string {
  return "rl:" + (process.env.VERCEL_ENV ?? "development");
}

/** Raised when the library reports its own 500 ms timeout (it fails open). */
export class RateLimitTimeoutError extends Error {
  constructor() {
    super("upstash call timed out");
  }
}

/** Same 500 ms the library applies to limit(); getRemaining has none of its own. */
const GET_REMAINING_TIMEOUT_MS = 500;

/**
 * Store backed by @upstash/ratelimit (atomic Lua sliding window). The
 * limiter factory is injectable so the wrapper can be tested without Redis.
 */
export function createUpstashStore(makeLimiter: (rule: RateLimitRule) => LimiterLike): LimiterStore {
  const cache = new Map<string, LimiterLike>();
  const limiterFor = (rule: RateLimitRule) => {
    const id = `${rule.windowMs}:${rule.max}`;
    let l = cache.get(id);
    if (!l) cache.set(id, (l = makeLimiter(rule)));
    return l;
  };
  const hit = async (key: string, rule: RateLimitRule) => {
    const r = await limiterFor(rule).limit(key);
    // Timeout resolves success:true with remaining:0: not a real decision.
    if (r.reason === "timeout") throw new RateLimitTimeoutError();
    return r;
  };
  // Keys already at their cap -> reset time (ms). Refused locally until then,
  // so a flood past the cap costs no further Redis reads. Pruned on write.
  const blockedUntil = new Map<string, number>();
  const readRemaining = async (key: string, rule: RateLimitRule) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        limiterFor(rule).getRemaining(key),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new RateLimitTimeoutError()), GET_REMAINING_TIMEOUT_MS);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  return {
    async count(key, rule) {
      const id = `${rule.windowMs}:${rule.max}:${key}`;
      const now = Date.now();
      const until = blockedUntil.get(id);
      if (until !== undefined && until > now) return rule.max;
      const { remaining, reset } = await readRemaining(key, rule);
      if (remaining <= 0 && typeof reset === "number" && reset > now) {
        for (const [k, t] of blockedUntil) if (t <= now) blockedUntil.delete(k);
        blockedUntil.set(id, reset);
      } else {
        blockedUntil.delete(id);
      }
      return Math.max(0, rule.max - remaining);
    },
    async record(key, rule) {
      await hit(key, rule);
    },
    async tryRecord(key, rule) {
      const r = await hit(key, rule);
      return { allowed: r.success, used: Math.max(0, rule.max - r.remaining) };
    },
  };
}

function realLimiter(redis: Redis, rule: RateLimitRule): LimiterLike {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(rule.max, durationString(rule.windowMs) as Duration),
    prefix: rateLimitPrefix(),
    timeout: 500,
    enableTelemetry: false,
    // Point 5: library default (in-memory block cache) stays ON. It only
    // short-circuits limit() for keys already blocked, so a flood does not
    // cost a Redis command per blocked request. getRemaining (used by
    // isRateLimited) never reads it, so the login "check now, record only
    // failures" pattern is unaffected. Limiters are cached at module level.
  });
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
      const redis = new Redis({ url, token });
      redisStore = createUpstashStore((rule) => realLimiter(redis, rule));
    } else {
      redisStore = null;
      if (process.env.NODE_ENV === "production") {
        console.warn("[rateLimit] Upstash env vars missing: using per-instance in-memory limiter.");
      }
    }
  }
  return redisStore ?? memory;
}

let lastFallbackLog = 0;
let suppressed = 0;

/**
 * C3: loud, throttled log for every fallback (first immediately, then at
 * most once a minute with a count). Covers timeouts, outages and the
 * Upstash command cap, where every call errors and we degrade silently.
 */
function logFallback(reason: unknown): void {
  const now = Date.now();
  if (lastFallbackLog && now - lastFallbackLog < 60_000) {
    suppressed++;
    return;
  }
  const extra = suppressed ? ` (${suppressed} fallbacks since last log)` : "";
  suppressed = 0;
  lastFallbackLog = now;
  console.error(`[rateLimit] FALLBACK ACTIVE — ${reason === "timeout" ? "timeout" : String(reason)}${extra}`);
}

/** Test-only: reset the fallback log throttle. */
export function resetFallbackLog(): void {
  lastFallbackLog = 0;
  suppressed = 0;
}

/**
 * C2: email- and IP-keyed limits are hashed so no address sits in the
 * third-party store. HMAC-SHA256 keyed by "ratelimit:" + AUTH_SECRET (read
 * directly: importing auth.ts would be circular), so the session-signing
 * secret itself is never the key. Hashed keys start new buckets; old ones
 * expire via TTL.
 */
function hashedKey(prefix: string, value: string): string {
  const secret = process.env.AUTH_SECRET ?? "dev-only-salt";
  return `${prefix}:${createHmac("sha256", `ratelimit:${secret}`).update(value).digest("hex")}`;
}

export function emailLimitKey(prefix: string, email: string): string {
  return hashedKey(prefix, email.trim().toLowerCase());
}

/** Point 4: same hashing for client IPs, so no raw IP sits in Upstash. */
export function ipLimitKey(prefix: string, ip: string): string {
  return hashedKey(prefix, ip.trim());
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
    logFallback(err instanceof RateLimitTimeoutError ? "timeout" : err);
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
