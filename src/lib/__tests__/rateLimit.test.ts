import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  checkRateLimit,
  isRateLimited,
  recordRateLimit,
  resetRateLimits,
  createMemoryStore,
  createRedisStore,
  RATE_LIMITS,
  type RedisLike,
  clientIp,
} from "@/lib/rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("allows up to max requests, then blocks", async () => {
    const rule = { windowMs: 60_000, max: 3 };
    expect((await checkRateLimit("k1", rule)).allowed).toBe(true);
    expect((await checkRateLimit("k1", rule)).allowed).toBe(true);
    const third = (await checkRateLimit("k1", rule));
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
    expect((await checkRateLimit("k1", rule)).allowed).toBe(false);
  });

  it("keeps separate budgets per key", async () => {
    const rule = { windowMs: 60_000, max: 1 };
    expect((await checkRateLimit("a", rule)).allowed).toBe(true);
    expect((await checkRateLimit("a", rule)).allowed).toBe(false);
    expect((await checkRateLimit("b", rule)).allowed).toBe(true);
  });

  it("frees the budget after the window passes", async () => {
    const rule = { windowMs: 15, max: 1 };
    expect((await checkRateLimit("w", rule)).allowed).toBe(true);
    expect((await checkRateLimit("w", rule)).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 25));
    expect((await checkRateLimit("w", rule)).allowed).toBe(true);
  });

  it("peek/record lets a caller count only failures (login semantics)", async () => {
    const rule = { windowMs: 60_000, max: 2 };
    expect(await isRateLimited("f", rule)).toBe(false);
    await recordRateLimit("f", rule);
    expect(await isRateLimited("f", rule)).toBe(false);
    await recordRateLimit("f", rule);
    expect(await isRateLimited("f", rule)).toBe(true);
    // Peeking never records: a fresh key is still allowed.
    expect(await isRateLimited("fresh", rule)).toBe(false);
    expect((await checkRateLimit("fresh", rule)).allowed).toBe(true);
  });

  it("resetRateLimits clears every bucket", async () => {
    const rule = { windowMs: 60_000, max: 1 };
    expect((await checkRateLimit("r", rule)).allowed).toBe(true);
    expect((await checkRateLimit("r", rule)).allowed).toBe(false);
    resetRateLimits();
    expect((await checkRateLimit("r", rule)).allowed).toBe(true);
  });

  it("ships sane rules for the money/auth routes", async () => {
    // A limit of 0 or a negative window would silently block (or never
    // block) a route, so pin the shipped rules to sane values.
    for (const rule of Object.values(RATE_LIMITS)) {
      expect(rule.max).toBeGreaterThan(0);
      expect(rule.windowMs).toBeGreaterThan(0);
    }
  });

  it("Phase 6: the AI/chart budgets match the old per-route maps", async () => {
    // The six deleted per-route maps had these exact budgets; the
    // shared limiter must not silently tighten or loosen them.
    expect(RATE_LIMITS.aiGenerateIp).toEqual({ windowMs: 60 * 60_000, max: 20 });
    expect(RATE_LIMITS.aiFollowUpIp).toEqual({ windowMs: 60 * 60_000, max: 10 });
    expect(RATE_LIMITS.chartCalcIp).toEqual({ windowMs: 60 * 60_000, max: 20 });
    expect(RATE_LIMITS.chartGeocodeIp).toEqual({ windowMs: 60 * 60_000, max: 20 });
    expect(RATE_LIMITS.chartInterpretIp).toEqual({ windowMs: 60 * 60_000, max: 20 });
    expect(RATE_LIMITS.reportsGenerateIp).toEqual({ windowMs: 60 * 60_000, max: 20 });
  });

  it("Phase 6: the previously unrated routes have strict budgets", async () => {
    expect(RATE_LIMITS.accountDeleteUser).toEqual({ windowMs: 60 * 60_000, max: 3 });
    expect(RATE_LIMITS.accountExportUser).toEqual({ windowMs: 60 * 60_000, max: 10 });
    expect(RATE_LIMITS.historySyncUser).toEqual({ windowMs: 60 * 60_000, max: 20 });
    expect(RATE_LIMITS.readIp).toEqual({ windowMs: 60_000, max: 60 });
  });
});

describe("clientIp", () => {
  it("x-vercel-forwarded-for wins over a forged x-forwarded-for first entry", async () => {
    const req = new NextRequest("http://localhost", {
      headers: {
        "x-vercel-forwarded-for": "real-client-ip",
        "x-forwarded-for": "forged-ip, proxy-ip",
      },
    });
    expect(clientIp(req)).toBe("real-client-ip");
  });

  it("x-forwarded-for 'forged-ip, real-ip' returns the real (last) entry", async () => {
    const req = new NextRequest("http://localhost", {
      headers: {
        "x-forwarded-for": "forged-ip, real-ip",
      },
    });
    expect(clientIp(req)).toBe("real-ip");
  });

  it("single-entry x-forwarded-for returns that entry", async () => {
    const req = new NextRequest("http://localhost", {
      headers: {
        "x-forwarded-for": "single-ip",
      },
    });
    expect(clientIp(req)).toBe("single-ip");
  });

  it("no headers returns 'unknown'", async () => {
    const req = new NextRequest("http://localhost");
    expect(clientIp(req)).toBe("unknown");
  });

  it("x-real-ip is used when no forwarded headers are present", async () => {
    const req = new NextRequest("http://localhost", {
      headers: {
        "x-real-ip": "192.0.2.1",
      },
    });
    expect(clientIp(req)).toBe("192.0.2.1");
  });
});

/**
 * Item 4: a fake Redis that holds sorted sets in ONE shared object, the
 * way Upstash is one shared server. Each "instance" below is a separate
 * store wrapper (as each Vercel instance has its own process memory),
 * but both point at the same fake server.
 */
function fakeRedis(failing = { on: false }): RedisLike {
  const z = new Map<string, { score: number; member: string }[]>();
  const guard = () => {
    if (failing.on) throw new Error("upstash unreachable");
  };
  const pipeline = () => {
    const ops: (() => unknown)[] = [];
    const chain = {
      zremrangebyscore(k: string, min: number, max: number) {
        ops.push(() => {
          z.set(k, (z.get(k) ?? []).filter((e) => e.score < min || e.score > max));
          return 0;
        });
        return chain;
      },
      zadd(k: string, e: { score: number; member: string }) {
        ops.push(() => (z.set(k, [...(z.get(k) ?? []), e]), 1));
        return chain;
      },
      zcard(k: string) {
        ops.push(() => (z.get(k) ?? []).length);
        return chain;
      },
      pexpire() {
        ops.push(() => 1);
        return chain;
      },
      async exec() {
        guard();
        return ops.map((f) => f());
      },
    };
    return chain;
  };
  return {
    pipeline,
    async zrem(k: string, m: string) {
      guard();
      z.set(k, (z.get(k) ?? []).filter((e) => e.member !== m));
    },
  };
}

describe("shared store (item 4)", () => {
  const rule = { windowMs: 60_000, max: 3 };

  it("two separate limiter instances share one budget", async () => {
    const server = fakeRedis();
    const instanceA = createRedisStore(server);
    const instanceB = createRedisStore(server);
    expect((await instanceA.tryRecord("ip", rule)).allowed).toBe(true);
    expect((await instanceB.tryRecord("ip", rule)).allowed).toBe(true);
    expect((await instanceA.tryRecord("ip", rule)).allowed).toBe(true);
    // Fourth hit lands on the other instance and is still denied.
    expect((await instanceB.tryRecord("ip", rule)).allowed).toBe(false);
    expect(await instanceA.count("ip", rule)).toBe(3);
  });

  it("per-instance memory stores do NOT share (why the in-memory limiter was not global)", async () => {
    const a = createMemoryStore();
    const b = createMemoryStore();
    for (let i = 0; i < 3; i++) await a.tryRecord("ip", rule);
    expect((await a.tryRecord("ip", rule)).allowed).toBe(false);
    expect((await b.tryRecord("ip", rule)).allowed).toBe(true);
  });

  it("denied hits are rolled back and do not extend the lockout", async () => {
    const store = createRedisStore(fakeRedis());
    for (let i = 0; i < 5; i++) await store.tryRecord("k", rule);
    expect(await store.count("k", rule)).toBe(3);
  });

  it("peek/record on the shared store (login semantics)", async () => {
    const store = createRedisStore(fakeRedis());
    expect(await store.count("f", rule)).toBe(0);
    await store.record("f", rule);
    await store.record("f", rule);
    expect(await store.count("f", rule)).toBe(2);
  });
});

describe("store selection and fail-open (item 4)", () => {
  const URL_KEY = "UPSTASH_REDIS_REST_KV_REST_API_URL";
  const TOKEN_KEY = "UPSTASH_REDIS_REST_KV_REST_API_TOKEN";
  const saved = { u: process.env[URL_KEY], t: process.env[TOKEN_KEY] };

  afterEach(() => {
    vi.doUnmock("@upstash/redis");
    vi.resetModules();
    if (saved.u === undefined) delete process.env[URL_KEY];
    else process.env[URL_KEY] = saved.u;
    if (saved.t === undefined) delete process.env[TOKEN_KEY];
    else process.env[TOKEN_KEY] = saved.t;
  });

  it("without the Upstash env vars it uses memory and never constructs a client", async () => {
    delete process.env[URL_KEY];
    delete process.env[TOKEN_KEY];
    const ctor = vi.fn();
    vi.resetModules();
    vi.doMock("@upstash/redis", () => ({ Redis: ctor }));
    const mod = await import("@/lib/rateLimit");
    const r = { windowMs: 60_000, max: 1 };
    expect((await mod.checkRateLimit("m", r)).allowed).toBe(true);
    expect((await mod.checkRateLimit("m", r)).allowed).toBe(false);
    expect(ctor).not.toHaveBeenCalled();
  });

  it("with the env vars it builds the client from the exact KV-named vars, and fails OPEN when Upstash errors", async () => {
    process.env[URL_KEY] = "https://example.invalid";
    process.env[TOKEN_KEY] = "tok";
    const seen: unknown[] = [];
    const failing = { on: true };
    const server = fakeRedis(failing);
    vi.resetModules();
    vi.doMock("@upstash/redis", () => ({
      Redis: function (cfg: unknown) {
        seen.push(cfg);
        return server;
      },
    }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mod = await import("@/lib/rateLimit");
    const r = { windowMs: 60_000, max: 1 };
    // Outage: request is allowed (not a hard deny) and the error is logged.
    expect((await mod.checkRateLimit("o", r)).allowed).toBe(true);
    expect(errSpy).toHaveBeenCalled();
    expect(await mod.isRateLimited("fresh", r)).toBe(false);
    // Recovery: the shared store is used again.
    failing.on = false;
    expect((await mod.checkRateLimit("s", r)).allowed).toBe(true);
    expect((await mod.checkRateLimit("s", r)).allowed).toBe(false);
    expect(seen).toEqual([{ url: "https://example.invalid", token: "tok" }]);
    errSpy.mockRestore();
  });
});
