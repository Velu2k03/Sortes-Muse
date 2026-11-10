import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  getUserById: vi.fn(),
  hasUsedFreeReading: vi.fn(),
  saveReadingWithSpend: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
  guestFreeUsed: vi.fn(),
  setGuestFreeUsed: vi.fn(),
}));

import { POST, validateReading } from "@/app/api/reading/generate/route";
import { getUserById, hasUsedFreeReading, saveReadingWithSpend } from "@/lib/db";
import { getSession, guestFreeUsed, setGuestFreeUsed } from "@/lib/auth";
import { RATE_LIMITS, resetRateLimits, ipLimitKey, isRateLimited, recordRateLimit } from "@/lib/rateLimit";

const mockedGetUserById = vi.mocked(getUserById);
const mockedSave = vi.mocked(saveReadingWithSpend);
const mockedHasUsedFree = vi.mocked(hasUsedFreeReading);
const mockedGetSession = vi.mocked(getSession);
const mockedGuestUsed = vi.mocked(guestFreeUsed);
const mockedSetGuestUsed = vi.mocked(setGuestFreeUsed);

// A valid reading under the Phase E validator: 300-600 words, names
// every drawn card, echoes the question ("What should I focus on
// next?"), asks one reflection question, and names one practical step.
const READING_TEXT = [
  "Dear friend, your question about what to focus on next sits at the heart of this reading, and the cards answer it together rather than one by one.",
  "The Fool opens the draw with a reminder that a beginning does not need a map, only a willing first step and an honest look at what you carry. The road ahead is not asking you to have it all worked out. It is asking you to notice which direction your attention keeps returning to, and to trust that return as information rather than restlessness.",
  "The Magician follows with focus and craft, showing that the tools you need are already in your hands and that the work now is choosing where to aim them. This is the card of gathering what is scattered and putting it to use. Your next step is smaller than the decision you are afraid of, and the Magician insists that the small step counts as real progress, not as a rehearsal for it.",
  "The High Priestess closes the draw with quiet counsel: some answers arrive by waiting and listening, not by pushing, and your own attention is the most reliable guide you have. She does not hurry you. She asks you to keep one evening free of noise and notice what surfaces when nothing is demanding an answer from you.",
  "What stands out for your question is the movement from openness through skill to stillness, a sequence that asks you to begin, to shape, and then to listen before you judge the result. The tension in this draw is between starting before you feel ready and waiting until the picture is complete, and both cards are right in their own season.",
  "What you may be overlooking is how much of the next step is already in your hands. One practical step you could take this week is to choose a single small task from the change you are weighing and finish it before Friday, then notice what that finished task teaches you about the larger choice. What would change if you treated the next step as an experiment instead of a verdict?",
].join(" ");

function req(body: unknown, ip: string): NextRequest {
  return new NextRequest("http://localhost/api/reading/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

function body(spreadSlug: string) {
  return {
    spreadSlug,
    cards: [
      { cardId: "major-00", reversed: false, position: "Present", positionKey: "present", name: "The Fool" },
      { cardId: "major-01", reversed: false, position: "Challenge", positionKey: "challenge", name: "The Magician" },
      { cardId: "major-02", reversed: false, position: "Outcome", positionKey: "outcome", name: "The High Priestess" },
    ],
    intake: {
      category: "general",
      categoryName: "General",
      firstName: "friend",
      answers: {},
      story: "I am at a crossroads and want clarity on my next step.",
      question: "What should I focus on next?",
    },
  };
}

describe("POST /api/reading/generate — no provider key (Phase 6 AI fallback)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Deliberately NO OPENROUTER_API_KEY: this is the production
    // misconfiguration case. The route must fail honestly (503) and
    // deterministically, never call the provider, and never spend.
    delete process.env.OPENROUTER_API_KEY;
    mockedGetUserById.mockResolvedValue({
      id: "u1",
      email: "a@b.co",
      credits: 5,
      created_at: "2026-11-05T00:00:00Z",
    });
    mockedHasUsedFree.mockResolvedValue(false);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 503 with fallback:true, calls no model, spends nothing", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    const res = await POST(req(body("quick-insight"), "10.0.0.9"));
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.fallback).toBe(true);
    expect(data.error).toContain("No Oracle was spent");
    expect(data.interpretation).toBeUndefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("is deterministic: two identical calls return the same body", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    const a = await POST(req(body("quick-insight"), "10.0.0.9"));
    const b = await POST(req(body("quick-insight"), "10.0.0.9"));
    expect(a.status).toBe(b.status);
    expect(await a.json()).toEqual(await b.json());
  });
});

describe("POST /api/reading/generate — first free Quick Insight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    process.env.OPENROUTER_API_KEY = "test-key";
    mockedGetUserById.mockResolvedValue({
      id: "u1",
      email: "a@b.co",
      credits: 5,
      created_at: "2026-11-05T00:00:00Z",
    });
    mockedHasUsedFree.mockResolvedValue(false);
    mockedGuestUsed.mockResolvedValue(false);
    mockedSave.mockImplementation(async (_u, _r, tryFree) => ({ ok: true, free: tryFree }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: READING_TEXT } }],
          model: "nvidia/nemotron-3-ultra-550b-a55b:free",
        }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
  });

  it("does not charge a signed-in first-timer for Quick Insight, and marks the free use", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    const res = await POST(req(body("quick-insight"), "10.0.0.1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.free).toBe(true);
    expect(data.interpretation).toContain("The Fool");
    expect(mockedSave).toHaveBeenCalledWith("u1", expect.objectContaining({ interpretation: expect.stringContaining("The Fool") }), true);
  });

  it("charges a signed-in user on the second Quick Insight", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedHasUsedFree.mockResolvedValue(true);
    const res = await POST(req(body("quick-insight"), "10.0.0.2"));
    expect(res.status).toBe(200);
    expect((await res.json()).free).toBe(false);
    expect(mockedSave).toHaveBeenCalledWith("u1", expect.objectContaining({ interpretation: expect.stringContaining("The Fool") }), false);
  });

  // Phase B (R7): the free claim is atomic. When a concurrent
  // request claims the free use first, this request spends one
  // Oracle instead of serving a second free reading, and the
  // response reports free: false because the reading was paid for.
  it("spends when the free claim loses the race (mark returns false)", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedSave.mockResolvedValue({ ok: true, free: false });
    const res = await POST(req(body("quick-insight"), "10.0.0.5"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.free).toBe(false);
    expect(data.interpretation).toContain("The Fool");
    expect(mockedSave).toHaveBeenCalledWith("u1", expect.objectContaining({ interpretation: expect.stringContaining("The Fool") }), true);
  });

  it("returns 402 when the lost-race spend cannot be covered", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedSave.mockResolvedValue({ ok: false, free: false });
    const res = await POST(req(body("quick-insight"), "10.0.0.6"));
    expect(res.status).toBe(402);
    expect((await res.json()).interpretation).toBeUndefined();
  });

  // Phase 6B regression: the response used to reuse the pre-check
  // user (read before generation and the spend), so a paid reading
  // reported a balance 1 higher than the real post-spend balance.
  // The route must re-fetch after the spend.
  it("reports the post-spend balance, not the pre-check balance", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedHasUsedFree.mockResolvedValue(true);
    mockedGetUserById
      .mockResolvedValueOnce({
        id: "u1",
        email: "a@b.co",
        credits: 5,
        created_at: "2026-11-05T00:00:00Z",
      })
      .mockResolvedValueOnce({
        id: "u1",
        email: "a@b.co",
        credits: 4,
        created_at: "2026-11-05T00:00:00Z",
      });
    const res = await POST(req(body("quick-insight"), "10.0.0.4"));
    expect(res.status).toBe(200);
    expect((await res.json()).credits).toBe(4);
  });

  it("blocks the second Quick Insight with 402 when the balance cannot cover it", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedHasUsedFree.mockResolvedValue(true);
    mockedSave.mockResolvedValue({ ok: false, free: false });
    const res = await POST(req(body("quick-insight"), "10.0.0.3"));
    expect(res.status).toBe(402);
    const data = await res.json();
    expect(data.interpretation).toBeUndefined();
    expect(data.error).toContain("No Oracle was spent");
  });

  // Phase 6 (N5): the 402 above used to come AFTER a full model call.
  // With a 0 balance the route must refuse before calling the model.
  it("returns 402 before any model call when the balance is 0", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedHasUsedFree.mockResolvedValue(true);
    mockedGetUserById.mockResolvedValue({
      id: "u1",
      email: "a@b.co",
      credits: 0,
      created_at: "2026-11-05T00:00:00Z",
    });
    const res = await POST(req(body("quick-insight"), "10.0.0.7"));
    expect(res.status).toBe(402);
    expect((await res.json()).error).toContain("No Oracle was spent");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("charges a signed-in first-timer on other spreads: free is Quick Insight only", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    const res = await POST(req(body("past-present-future"), "10.0.0.4"));
    expect(res.status).toBe(200);
    expect((await res.json()).free).toBe(false);
    expect(mockedSave).toHaveBeenCalledWith("u1", expect.objectContaining({ interpretation: expect.stringContaining("The Fool") }), false);
  });

  it("serves a guest's first Quick Insight free and sets the signed used-cookie", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await POST(req(body("quick-insight"), "10.0.0.5"));
    expect(res.status).toBe(200);
    expect((await res.json()).free).toBe(true);
    expect(mockedSave).not.toHaveBeenCalled();
    expect(mockedSetGuestUsed).toHaveBeenCalledTimes(1);
  });

  // Item 1 regression: before the fix a guest got a full AI generation
  // for ANY spread (and a repeat Quick Insight) for free. Fails on
  // pre-fix main (200); now 401 before any model call.
  it.each(["past-present-future", "celtic-cross", "three-card"])(
    "refuses a cookie-less guest on %s with 401 and no model call",
    async (slug) => {
      mockedGetSession.mockResolvedValue(null);
      const res = await POST(req(body(slug), "10.0.0.8"));
      expect(res.status).toBe(401);
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect((await res.json()).interpretation).toBeUndefined();
    }
  );

  it("refuses a guest whose free Quick Insight cookie is already used (401)", async () => {
    mockedGetSession.mockResolvedValue(null);
    mockedGuestUsed.mockResolvedValue(true);
    const res = await POST(req(body("quick-insight"), "10.0.0.9"));
    expect(res.status).toBe(401);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // Point 4: the per-IP cap is checked before the model call and recorded
  // only after a successful generation. The bucket is seeded directly
  // because the hourly aiGenerateIp budget (20) would stop a 50-request loop.
  it("caps cookie-less guest Quick Insights per IP at 50: the request after the cap is 401 with no model call", async () => {
    expect(RATE_LIMITS.guestFreeIp.max).toBe(50);
    mockedGetSession.mockResolvedValue(null);
    const ip = "10.7.7.7";
    const key = ipLimitKey("guest-free", ip);
    for (let i = 0; i < RATE_LIMITS.guestFreeIp.max - 1; i++) await recordRateLimit(key, RATE_LIMITS.guestFreeIp);
    // 49 used: the 50th still succeeds (a cap of 5 would already refuse).
    expect((await POST(req(body("quick-insight"), ip))).status).toBe(200);
    const fetchCalls = vi.mocked(globalThis.fetch).mock.calls.length;
    const denied = await POST(req(body("quick-insight"), ip));
    expect(denied.status).toBe(401);
    expect((await denied.json()).error).toContain("Sign in to continue");
    expect(vi.mocked(globalThis.fetch).mock.calls.length).toBe(fetchCalls);
    // A different IP is unaffected, and a signed-in user from the capped IP is not capped.
    expect((await POST(req(body("quick-insight"), "10.7.7.8"))).status).toBe(200);
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedHasUsedFree.mockResolvedValue(true);
    expect((await POST(req(body("quick-insight"), ip))).status).toBe(200);
  });

  it("a failed generation does not consume a guest IP slot; a successful one consumes exactly one", async () => {
    mockedGetSession.mockResolvedValue(null);
    const ip = "10.7.7.20";
    const rule = RATE_LIMITS.guestFreeIp;
    const key = ipLimitKey("guest-free", ip);
    // Fill to max-1, then fail more times than the one slot left.
    for (let i = 0; i < rule.max - 1; i++) await recordRateLimit(key, rule);
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);
    for (let i = 0; i < 3; i++) expect((await POST(req(body("quick-insight"), ip))).status).toBe(503);
    expect(await isRateLimited(key, rule)).toBe(false);
    // Success now still works and takes the last slot.
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: READING_TEXT } }], model: "nvidia/nemotron-3-ultra-550b-a55b:free" }),
    } as Response);
    expect((await POST(req(body("quick-insight"), ip))).status).toBe(200);
    expect(await isRateLimited(key, rule)).toBe(true);
  });

  // Batch D (B1), regression guard (the code was already right): a
  // signed-in user's first-ever Celtic Cross is NOT free. serverFree
  // requires isQuickInsight, so the route asks for a spend (tryFree=false)
  // and never touches the free grant.
  it("signed-in first-ever Celtic Cross spends 1: route calls save with tryFree=false", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedHasUsedFree.mockResolvedValue(false);
    const res = await POST(req(body("celtic-cross"), "10.0.0.13"));
    expect(res.status).toBe(200);
    expect((await res.json()).free).toBe(false);
    expect(mockedSave).toHaveBeenCalledTimes(1);
    expect(mockedSave.mock.calls[0][2]).toBe(false);
    expect(mockedSave.mock.calls[0][1]).toEqual(expect.objectContaining({ free: false }));
  });

  // Item 1: claimFree in the body is no longer read at all.
  it("ignores claimFree from the body: claimFree:true does not unlock other spreads", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await POST(req({ ...body("celtic-cross"), claimFree: true }, "10.0.0.10"));
    expect(res.status).toBe(401);
  });

  // Item 3: the reading row is written by the server with the spend.
  it("signed-in: returns the server-saved reading (same id) so the tab can close safely", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedHasUsedFree.mockResolvedValue(true);
    const res = await POST(req(body("quick-insight"), "10.0.0.11"));
    const data = await res.json();
    expect(mockedSave).toHaveBeenCalledTimes(1);
    const saved = mockedSave.mock.calls[0][1] as unknown as { id: string; interpretation: string };
    expect(data.reading.id).toBe(saved.id);
    expect(saved.interpretation).toBe(data.interpretation);
  });

  it("signed-in: writes nothing and returns 402 when the transaction finds no credit", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedHasUsedFree.mockResolvedValue(true);
    mockedSave.mockResolvedValue({ ok: false, free: false });
    const res = await POST(req(body("quick-insight"), "10.0.0.12"));
    expect(res.status).toBe(402);
    expect((await res.json()).reading).toBeUndefined();
  });
});

describe("POST /api/reading/generate — input validation (Phase 2, 2.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
    mockedGetSession.mockResolvedValue(null);
    mockedGuestUsed.mockResolvedValue(false);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: READING_TEXT } }],
          model: "nvidia/nemotron-3-ultra-550b-a55b:free",
        }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
  });

  it("rejects a story over 2000 characters with 400", async () => {
    const b = body("quick-insight");
    b.intake.story = "x".repeat(2001);
    const res = await POST(req(b, "10.0.1.1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("2000");
  });

  it("rejects a question over 300 characters with 400", async () => {
    const b = body("quick-insight");
    b.intake.question = "x".repeat(301);
    const res = await POST(req(b, "10.0.1.2"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("300");
  });

  it("accepts a story at exactly 2000 characters", async () => {
    const b = body("quick-insight");
    b.intake.story = "x".repeat(2000);
    const res = await POST(req(b, "10.0.1.3"));
    expect(res.status).toBe(200);
  });

  it("rejects more than 20 cards with 400", async () => {
    const b = body("quick-insight");
    b.cards = Array.from({ length: 21 }, (_, i) => ({
      cardId: "major-00",
      reversed: false,
      position: `Card ${i}`,
      positionKey: `c${i}`,
      name: "The Fool",
    }));
    const res = await POST(req(b, "10.0.1.4"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("20");
  });
});

// Phase E (item 1): the automated swap test. A fixed interpretation
// with its card names swapped for cards not in the draw must fail
// validation, so a prompt change that breaks grounding is caught by
// the suite instead of reaching a paying user. It runs on every
// prompt change because it lives in this route's suite.
describe("validateReading — swap test", () => {
  const cards = [
    { cardId: "major-00", reversed: false, position: "Present", name: "The Fool" },
    { cardId: "major-01", reversed: false, position: "Challenge", name: "The Magician" },
    { cardId: "major-02", reversed: false, position: "Outcome", name: "The High Priestess" },
  ];
  const question = "What should I focus on next?";

  it("accepts the fixed interpretation as written", () => {
    expect(validateReading(READING_TEXT, cards, question)).toBe(true);
  });

  it("rejects the same interpretation with every card name swapped", () => {
    const swapped = READING_TEXT.replaceAll("The Fool", "The Tower")
      .replaceAll("The Magician", "Death")
      .replaceAll("The High Priestess", "The Devil");
    expect(validateReading(swapped, cards, question)).toBe(false);
  });
});
