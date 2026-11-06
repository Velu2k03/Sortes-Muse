import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  getUserById: vi.fn(),
  spendUserCredits: vi.fn(),
  hasUsedFreeReading: vi.fn(),
  markFreeReadingUsed: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

import { POST, validateReading } from "@/app/api/reading/generate/route";
import {
  getUserById,
  spendUserCredits,
  hasUsedFreeReading,
  markFreeReadingUsed,
} from "@/lib/db";
import { getSession } from "@/lib/auth";

const mockedGetUserById = vi.mocked(getUserById);
const mockedSpend = vi.mocked(spendUserCredits);
const mockedHasUsedFree = vi.mocked(hasUsedFreeReading);
const mockedMarkFree = vi.mocked(markFreeReadingUsed);
const mockedGetSession = vi.mocked(getSession);

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

function body(spreadSlug: string, claimFree = false) {
  return {
    spreadSlug,
    claimFree,
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
    mockedSpend.mockResolvedValue(true);
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
    expect(mockedSpend).not.toHaveBeenCalled();
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
    process.env.OPENROUTER_API_KEY = "test-key";
    mockedGetUserById.mockResolvedValue({
      id: "u1",
      email: "a@b.co",
      credits: 5,
      created_at: "2026-11-05T00:00:00Z",
    });
    mockedSpend.mockResolvedValue(true);
    mockedHasUsedFree.mockResolvedValue(false);
    mockedMarkFree.mockResolvedValue(true);
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
    expect(mockedSpend).not.toHaveBeenCalled();
    expect(mockedMarkFree).toHaveBeenCalledWith("u1");
  });

  it("charges a signed-in user on the second Quick Insight", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedHasUsedFree.mockResolvedValue(true);
    const res = await POST(req(body("quick-insight"), "10.0.0.2"));
    expect(res.status).toBe(200);
    expect((await res.json()).free).toBe(false);
    expect(mockedSpend).toHaveBeenCalledWith("u1", 1);
    expect(mockedMarkFree).not.toHaveBeenCalled();
  });

  // Phase B (R7): the free claim is atomic. When a concurrent
  // request claims the free use first, this request spends one
  // Oracle instead of serving a second free reading, and the
  // response reports free: false because the reading was paid for.
  it("spends when the free claim loses the race (mark returns false)", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedMarkFree.mockResolvedValue(false);
    const res = await POST(req(body("quick-insight"), "10.0.0.5"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.free).toBe(false);
    expect(data.interpretation).toContain("The Fool");
    expect(mockedMarkFree).toHaveBeenCalledWith("u1");
    expect(mockedSpend).toHaveBeenCalledWith("u1", 1);
  });

  it("returns 402 when the lost-race spend cannot be covered", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedMarkFree.mockResolvedValue(false);
    mockedSpend.mockResolvedValue(false);
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
    mockedSpend.mockResolvedValue(false);
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
    expect(mockedSpend).not.toHaveBeenCalled();
  });

  it("charges a signed-in first-timer on other spreads: free is Quick Insight only", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    const res = await POST(req(body("past-present-future"), "10.0.0.4"));
    expect(res.status).toBe(200);
    expect((await res.json()).free).toBe(false);
    expect(mockedSpend).toHaveBeenCalledWith("u1", 1);
    expect(mockedMarkFree).not.toHaveBeenCalled();
  });

  it("serves a guest first free Quick Insight without spending, on the device claim", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await POST(req(body("quick-insight", true), "10.0.0.5"));
    expect(res.status).toBe(200);
    expect((await res.json()).free).toBe(true);
    expect(mockedSpend).not.toHaveBeenCalled();
    expect(mockedMarkFree).not.toHaveBeenCalled();
  });

  it("serves a guest repeat Quick Insight as paid (free: false)", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await POST(req(body("quick-insight", false), "10.0.0.6"));
    expect(res.status).toBe(200);
    expect((await res.json()).free).toBe(false);
  });
});

describe("POST /api/reading/generate — input validation (Phase 2, 2.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
    mockedGetSession.mockResolvedValue(null);
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
    const b = body("quick-insight", true);
    b.intake.story = "x".repeat(2001);
    const res = await POST(req(b, "10.0.1.1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("2000");
  });

  it("rejects a question over 300 characters with 400", async () => {
    const b = body("quick-insight", true);
    b.intake.question = "x".repeat(301);
    const res = await POST(req(b, "10.0.1.2"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("300");
  });

  it("accepts a story at exactly 2000 characters", async () => {
    const b = body("quick-insight", true);
    b.intake.story = "x".repeat(2000);
    const res = await POST(req(b, "10.0.1.3"));
    expect(res.status).toBe(200);
  });

  it("rejects more than 20 cards with 400", async () => {
    const b = body("quick-insight", true);
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
