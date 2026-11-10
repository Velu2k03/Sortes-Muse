import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  checkRateLimit,
  isRateLimited,
  recordRateLimit,
  resetRateLimits,
  createMemoryStore,
  createUpstashStore,
  durationString,
  emailLimitKey,
  ipLimitKey,
  rateLimitPrefix,
  resetFallbackLog,
  RATE_LIMITS,
  type LimiterLike,
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
 * Wrapper tests (C4): a shared in-memory mock stands in for the library,
 * the way Upstash is one shared server. Atomicity is the library's own
 * upstream-tested Lua job and is deliberately NOT emulated here.
 */
function mockServer(mode: { fail?: boolean; timeout?: boolean } = {}) {
  const used = new Map<string, number>();
  const makeLimiter = (rule: { max: number }): LimiterLike => ({
    async limit(id) {
      if (mode.fail) throw new Error("upstash unreachable");
      if (mode.timeout) return { success: true, remaining: 0, reason: "timeout" };
      const n = used.get(id) ?? 0;
      if (n >= rule.max) return { success: false, remaining: 0 };
      used.set(id, n + 1);
      return { success: true, remaining: rule.max - n - 1 };
    },
    async getRemaining(id) {
      if (mode.fail) throw new Error("upstash unreachable");
      return { remaining: rule.max - (used.get(id) ?? 0) };
    },
  });
  return { makeLimiter, used };
}

describe("shared store (C4 wrapper)", () => {
  const rule = { windowMs: 60_000, max: 3 };

  it("two separate store instances share one budget", async () => {
    const server = mockServer();
    const a = createUpstashStore(server.makeLimiter);
    const b = createUpstashStore(server.makeLimiter);
    expect((await a.tryRecord("ip", rule)).allowed).toBe(true);
    expect((await b.tryRecord("ip", rule)).allowed).toBe(true);
    expect((await a.tryRecord("ip", rule)).allowed).toBe(true);
    expect((await b.tryRecord("ip", rule)).allowed).toBe(false);
    expect(await a.count("ip", rule)).toBe(3);
  });

  it("per-instance memory stores do NOT share", async () => {
    const a = createMemoryStore();
    const b = createMemoryStore();
    for (let i = 0; i < 3; i++) await a.tryRecord("ip", rule);
    expect((await a.tryRecord("ip", rule)).allowed).toBe(false);
    expect((await b.tryRecord("ip", rule)).allowed).toBe(true);
  });

  it("denied hits do not consume budget", async () => {
    const store = createUpstashStore(mockServer().makeLimiter);
    for (let i = 0; i < 5; i++) await store.tryRecord("k", rule);
    expect(await store.count("k", rule)).toBe(3);
  });

  it("peek/record on the shared store (login semantics)", async () => {
    const store = createUpstashStore(mockServer().makeLimiter);
    expect(await store.count("f", rule)).toBe(0);
    await store.record("f", rule);
    await store.record("f", rule);
    expect(await store.count("f", rule)).toBe(2);
  });

  it("builds one limiter per distinct rule", async () => {
    const make = vi.fn(mockServer().makeLimiter);
    const store = createUpstashStore(make);
    await store.tryRecord("a", rule);
    await store.tryRecord("b", rule);
    await store.tryRecord("c", { windowMs: 1000, max: 1 });
    expect(make).toHaveBeenCalledTimes(2);
  });

  it("a library timeout is surfaced as an error, not a fake allow", async () => {
    const store = createUpstashStore(mockServer({ timeout: true }).makeLimiter);
    await expect(store.tryRecord("t", rule)).rejects.toThrow(/timed out/);
  });
});

describe("durationString / prefix / emailLimitKey", () => {
  it("maps every shipped window to an exact library duration", () => {
    expect(durationString(60_000)).toBe("1 m");
    expect(durationString(15 * 60_000)).toBe("15 m");
    expect(durationString(60 * 60_000)).toBe("60 m");
    expect(durationString(24 * 60 * 60_000)).toBe("1 d");
    expect(durationString(1500)).toBe("1500 ms");
    for (const r of Object.values(RATE_LIMITS)) {
      expect(durationString(r.windowMs)).toMatch(/^\d+ [dms]$/);
    }
  });

  it("C1: prefix is scoped by VERCEL_ENV", () => {
    const saved = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "production";
    expect(rateLimitPrefix()).toBe("rl:production");
    process.env.VERCEL_ENV = "preview";
    expect(rateLimitPrefix()).toBe("rl:preview");
    delete process.env.VERCEL_ENV;
    expect(rateLimitPrefix()).toBe("rl:development");
    if (saved !== undefined) process.env.VERCEL_ENV = saved;
  });

  it("C2: email keys are hashed, normalised, salted and never contain the address", () => {
    const k = emailLimitKey("login", "  Alice@Example.com ");
    expect(k).toBe(emailLimitKey("login", "alice@example.com"));
    expect(k).toMatch(/^login:[0-9a-f]{64}$/);
    expect(k).not.toContain("alice");
    expect(emailLimitKey("code", "alice@example.com")).toMatch(/^code:/);
    expect(emailLimitKey("login", "bob@example.com")).not.toBe(k);
    const saved = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "other-secret";
    expect(emailLimitKey("login", "alice@example.com")).not.toBe(k);
    if (saved === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = saved;
  });
});

describe("Point 4: ipLimitKey", () => {
  it("hashes the IP (SHA-256 hex), never contains it, and is stable per IP", () => {
    const k = ipLimitKey("guest-free", "203.0.113.9");
    expect(k).toMatch(/^guest-free:[0-9a-f]{64}$/);
    expect(k).not.toContain("203.0.113.9");
    expect(ipLimitKey("guest-free", "203.0.113.9")).toBe(k);
    expect(ipLimitKey("guest-free", "203.0.113.10")).not.toBe(k);
  });
});

describe("store selection and fail-open (C3/C4)", () => {
  const URL_KEY = "UPSTASH_REDIS_REST_KV_REST_API_URL";
  const TOKEN_KEY = "UPSTASH_REDIS_REST_KV_REST_API_TOKEN";
  const saved = { u: process.env[URL_KEY], t: process.env[TOKEN_KEY] };

  afterEach(() => {
    vi.doUnmock("@upstash/redis");
    vi.doUnmock("@upstash/ratelimit");
    vi.resetModules();
    vi.useRealTimers();
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

  async function withMockedLibrary(mode: { fail?: boolean; timeout?: boolean }) {
    process.env[URL_KEY] = "https://example.invalid";
    process.env[TOKEN_KEY] = "tok";
    const seenRedis: unknown[] = [];
    const seenConfig: Record<string, unknown>[] = [];
    const server = mockServer(mode);
    vi.resetModules();
    vi.doMock("@upstash/redis", () => ({
      Redis: function (cfg: unknown) {
        seenRedis.push(cfg);
      },
    }));
    vi.doMock("@upstash/ratelimit", () => ({
      Ratelimit: Object.assign(
        function (cfg: Record<string, unknown>) {
          seenConfig.push(cfg);
          return server.makeLimiter(rule(cfg));
        },
        { slidingWindow: (max: number, w: string) => ({ max, w }) }
      ),
    }));
    function rule(cfg: Record<string, unknown>) {
      return { max: (cfg.limiter as { max: number }).max };
    }
    const mod = await import("@/lib/rateLimit");
    return { mod, seenRedis, seenConfig };
  }

  it("builds the client from the exact KV vars with prefix/timeout config, and fails OPEN loudly when Upstash errors", async () => {
    resetFallbackLog();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = await withMockedLibrary({ fail: true });
    const r = { windowMs: 60_000, max: 1 };
    expect((await failing.mod.checkRateLimit("o", r)).allowed).toBe(true);
    expect(errSpy.mock.calls[0][0]).toContain("[rateLimit] FALLBACK ACTIVE");
    expect(await failing.mod.isRateLimited("fresh", r)).toBe(false);
    expect(failing.seenRedis).toEqual([{ url: "https://example.invalid", token: "tok" }]);
    expect(failing.seenConfig[0]).toMatchObject({ prefix: "rl:" + (process.env.VERCEL_ENV ?? "development"), timeout: 500, enableTelemetry: false });
    expect(failing.seenConfig[0]).not.toHaveProperty("ephemeralCache");
    errSpy.mockRestore();
  });

  it("uses the shared store when healthy (second hit denied)", async () => {
    const { mod } = await withMockedLibrary({});
    const r = { windowMs: 60_000, max: 1 };
    expect((await mod.checkRateLimit("s", r)).allowed).toBe(true);
    expect((await mod.checkRateLimit("s", r)).allowed).toBe(false);
  });

  it("C3: a timeout falls back to memory with a loud marker, throttled to once per minute with a count", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { mod } = await withMockedLibrary({ timeout: true });
    mod.resetFallbackLog();
    const r = { windowMs: 60_000, max: 5 };
    for (let i = 0; i < 4; i++) expect((await mod.checkRateLimit("t" + i, r)).allowed).toBe(true);
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy.mock.calls[0][0]).toBe("[rateLimit] FALLBACK ACTIVE — timeout");
    vi.setSystemTime(new Date("2026-01-01T00:01:01Z"));
    await mod.checkRateLimit("later", r);
    expect(errSpy).toHaveBeenCalledTimes(2);
    expect(errSpy.mock.calls[1][0]).toContain("3 fallbacks since last log");
    errSpy.mockRestore();
  });

  it("constructs a real Ratelimit with the explicit Redis client (no network call)", async () => {
    const { Redis } = await import("@upstash/redis");
    const { Ratelimit } = await import("@upstash/ratelimit");
    const redis = new Redis({ url: "https://example.invalid", token: "tok" });
    const rl = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "15 m"),
      prefix: rateLimitPrefix(),
      timeout: 500,
      enableTelemetry: false,
    });
    expect(typeof rl.limit).toBe("function");
    expect(typeof rl.getRemaining).toBe("function");
  });
});
