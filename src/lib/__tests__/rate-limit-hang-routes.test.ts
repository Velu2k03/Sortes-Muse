import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// Round 3 item 1: with a hung Upstash (getRemaining never resolves) the
// login and guest-generate routes must still answer within about a second,
// using the per-instance memory decision, and log the fallback line.
// limit() throws here so recorded hits land in the memory store, which is
// what proves the decision came from memory and not from a skipped check.
vi.mock("@/lib/db", () => ({
  getUserByEmail: vi.fn(async () => null),
  getUserById: vi.fn(),
  hasUsedFreeReading: vi.fn(async () => false),
  saveReadingWithSpend: vi.fn(),
  getReadingForUser: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => null),
  guestFreeUsed: vi.fn(async () => false),
  setGuestFreeUsed: vi.fn(),
  verifyPassword: vi.fn(async () => false),
  createSession: vi.fn(),
  SESSION_COOKIE: "sortes_session",
  SESSION_MAX_AGE: 1,
  authConfigured: () => true,
}));

const URL_KEY = "UPSTASH_REDIS_REST_KV_REST_API_URL";
const TOKEN_KEY = "UPSTASH_REDIS_REST_KV_REST_API_TOKEN";

async function load() {
  process.env[URL_KEY] = "https://example.invalid";
  process.env[TOKEN_KEY] = "tok";
  vi.resetModules();
  vi.doMock("@upstash/redis", () => ({ Redis: function () {} }));
  vi.doMock("@upstash/ratelimit", () => ({
    Ratelimit: Object.assign(
      function () {
        return {
          limit: async () => {
            throw new Error("upstash unreachable");
          },
          getRemaining: () => new Promise<never>(() => {}),
        };
      },
      { slidingWindow: () => ({}) }
    ),
  }));
  const rl = await import("@/lib/rateLimit");
  const login = await import("@/app/api/auth/login/route");
  const generate = await import("@/app/api/reading/generate/route");
  return { rl, login, generate };
}

function post(path: string, body: unknown, ip: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("hung Upstash getRemaining: routes answer in ~1s on the memory decision", () => {
  const saved = { u: process.env[URL_KEY], t: process.env[TOKEN_KEY], k: process.env.OPENROUTER_API_KEY };
  let errSpy: { mock: { calls: unknown[][] }; mockRestore: () => void };

  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.OPENROUTER_API_KEY;
  });
  afterEach(() => {
    errSpy.mockRestore();
    vi.doUnmock("@upstash/redis");
    vi.doUnmock("@upstash/ratelimit");
    vi.resetModules();
    for (const [k, v] of [[URL_KEY, saved.u], [TOKEN_KEY, saved.t], ["OPENROUTER_API_KEY", saved.k]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("login: a not-limited caller gets the normal answer (401) within ~1s, and the fallback is logged", async () => {
    const { rl, login } = await load();
    rl.resetFallbackLog();
    const t0 = Date.now();
    const res = await login.POST(post("/api/auth/login", { email: "a@b.co", password: "x" }, "10.1.1.1"));
    expect(res.status).toBe(401);
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(errSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes("FALLBACK ACTIVE — timeout"))).toBe(true);
  });

  it("login: the memory decision still blocks an email over its budget", async () => {
    const { rl, login } = await load();
    const key = rl.emailLimitKey("login", "a@b.co");
    for (let i = 0; i < rl.RATE_LIMITS.loginEmail.max; i++) await rl.recordRateLimit(key, rl.RATE_LIMITS.loginEmail);
    const t0 = Date.now();
    const res = await login.POST(post("/api/auth/login", { email: "a@b.co", password: "x" }, "10.1.1.2"));
    expect(res.status).toBe(429);
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  it("guest generate: an IP over its cap in memory is refused (401) within ~1s with no model call", async () => {
    const { rl, generate } = await load();
    vi.stubGlobal("fetch", vi.fn());
    try {
      const ip = "10.2.2.2";
      const key = rl.ipLimitKey("guest-free", ip);
      for (let i = 0; i < rl.RATE_LIMITS.guestFreeIp.max; i++) await rl.recordRateLimit(key, rl.RATE_LIMITS.guestFreeIp);
      const t0 = Date.now();
      const res = await generate.POST(
        post(
          "/api/reading/generate",
          {
            spreadSlug: "quick-insight",
            cards: [{ cardId: "major-00", reversed: false, position: "Present", positionKey: "present", name: "The Fool" }],
            intake: { category: "general", categoryName: "General", firstName: "friend", answers: {}, story: "A story about a choice.", question: "What next?" },
          },
          ip
        )
      );
      expect(res.status).toBe(401);
      expect(Date.now() - t0).toBeLessThan(1500);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
