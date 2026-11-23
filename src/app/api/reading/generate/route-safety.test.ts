import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  getUserById: vi.fn(),
  getReadingForUser: vi.fn(async () => null),
  isSpendBlockedPendingConversion: vi.fn(async () => false),
  hasUsedFreeReading: vi.fn(),
  saveReadingWithSpend: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
  guestFreeUsed: vi.fn(),
  setGuestFreeUsed: vi.fn(),
}));

import { POST } from "@/app/api/reading/generate/route";
import { getUserById, hasUsedFreeReading, saveReadingWithSpend } from "@/lib/db";
import { getSession, guestFreeUsed } from "@/lib/auth";
import { resetRateLimits } from "@/lib/rateLimit";
import { FINANCES_CLOSE, HEALTH_CLOSE } from "@/lib/safety";
import { openRouterStreamResponse, readRouteSse } from "@/lib/__tests__/sse-helpers";

const mockedGetUserById = vi.mocked(getUserById);
const mockedSave = vi.mocked(saveReadingWithSpend);
const mockedHasUsedFree = vi.mocked(hasUsedFreeReading);
const mockedGetSession = vi.mocked(getSession);
const mockedGuestUsed = vi.mocked(guestFreeUsed);

const CAPTURE_3 = "I feel like giving up. Nothing feels worth it anymore. What should I do?";

// A reading the Phase E validator accepts for both test questions:
// 300-600 words, every drawn card named, content words from both
// questions ("focus", "giving", "worth"), one reflection question,
// one practical step.
const READING_TEXT = [
  "Dear friend, your question about what to focus on next, and the feeling of giving up when nothing seems worth it, sits at the heart of this reading.",
  "The Fool opens the draw with a reminder that a beginning does not need a map, only a willing first step and an honest look at what you carry. The road ahead is not asking you to have it all worked out. It is asking you to notice which direction your attention keeps returning to, and to trust that return as information rather than restlessness.",
  "The Magician follows with focus and craft, showing that the tools you need are already in your hands and that the work now is choosing where to aim them. This is the card of gathering what is scattered and putting it to use. Your next step is smaller than the decision you are afraid of, and the Magician insists that the small step counts as real progress, not as a rehearsal for it.",
  "The High Priestess closes the draw with quiet counsel: some answers arrive by waiting and listening, not by pushing, and your own attention is the most reliable guide you have. She does not hurry you. She asks you to keep one evening free of noise and notice what surfaces when nothing is demanding an answer from you.",
  "What stands out for your question is the movement from openness through skill to stillness, a sequence that asks you to begin, to shape, and then to listen before you judge the result. The tension in this draw is between starting before you feel ready and waiting until the picture is complete, and both cards are right in their own season.",
  "What you may be overlooking is how much of the next step is already in your hands. One practical step you could take this week is to choose a single small task and finish it before Friday, then notice what that finished task teaches you. What would change if you treated the next step as an experiment instead of a verdict?",
].join(" ");

function req(body: unknown, ip: string): NextRequest {
  return new NextRequest("http://localhost/api/reading/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function body(question: string, opts: { category?: string; categoryName?: string; story?: string; spreadSlug?: string } = {}) {
  return {
    spreadSlug: opts.spreadSlug ?? "quick-insight",
    cards: [
      { cardId: "major-00", reversed: false, position: "Present", positionKey: "present", name: "The Fool" },
      { cardId: "major-01", reversed: false, position: "Challenge", positionKey: "challenge", name: "The Magician" },
      { cardId: "major-02", reversed: false, position: "Outcome", positionKey: "outcome", name: "The High Priestess" },
    ],
    intake: {
      category: opts.category ?? "general",
      categoryName: opts.categoryName ?? "General",
      firstName: "friend",
      answers: {},
      story: opts.story ?? "I am at a crossroads and want clarity on my next step.",
      question,
    },
  };
}

let ipN = 0;
const ip = () => `10.7.0.${++ipN}`;

describe("POST /api/reading/generate — Batch 1 safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    process.env.OPENROUTER_API_KEY = "test-key";
    mockedGetUserById.mockResolvedValue({ id: "u1", email: "a@b.co", credits: 500, created_at: "2026-11-05T00:00:00Z" });
    mockedHasUsedFree.mockResolvedValue(false);
    mockedGuestUsed.mockResolvedValue(false);
    mockedSave.mockImplementation(async (_u, _r, tryFree) => ({ ok: true, free: tryFree }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => openRouterStreamResponse(READING_TEXT, "model-a:free"))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
  });

  describe("S1 Tier A", () => {
    it("signed-in: support panel only, no model call, no save, no spend", async () => {
      mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
      const res = await POST(req(body("I want to kill myself. What do the cards say?"), ip()));
      expect(res.status).toBe(200);
      const { done, events, error } = await readRouteSse(res);
      expect(error).toBeNull();
      expect(events.map((e) => e.event)).toEqual(["support", "done"]);
      expect(done?.supportOnly).toBe(true);
      expect(done?.supportTier).toBe("A");
      expect(done?.interpretation).toBeUndefined();
      const support = done?.support as Record<string, string>;
      expect(support.helplineUrl).toBe("https://findahelpline.com");
      expect(support.emergencyLine).toContain("call your local emergency number");
      expect(support.noCreditsLine).toBe("No credits were spent.");
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(mockedSave).not.toHaveBeenCalled();
      expect(mockedHasUsedFree).not.toHaveBeenCalled();
    });

    it("guest whose free reading is used still gets the panel, not the 401", async () => {
      mockedGetSession.mockResolvedValue(null);
      mockedGuestUsed.mockResolvedValue(true);
      const res = await POST(req(body("I don't want to live anymore"), ip()));
      expect(res.status).toBe(200);
      const { done } = await readRouteSse(res);
      expect(done?.supportOnly).toBe(true);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("guest who is not allowed this spread (not Quick Insight) still gets the panel", async () => {
      mockedGetSession.mockResolvedValue(null);
      const res = await POST(req(body("Will things improve?", { story: "I keep thinking about suicide.", spreadSlug: "three-card" }), ip()));
      expect(res.status).toBe(200);
      expect((await readRouteSse(res)).done?.supportTier).toBe("A");
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  describe("S1 Tier B", () => {
    it("capture-3 question: panel first, then the reading, tier on done and on the saved row", async () => {
      mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
      const res = await POST(req(body(CAPTURE_3), ip()));
      const { done, events, error } = await readRouteSse(res);
      expect(error).toBeNull();
      expect(events[0].event).toBe("support");
      expect((events[0].data as { tier: string }).tier).toBe("B");
      const firstText = events.findIndex((e) => e.event === "text");
      expect(firstText).toBeGreaterThan(0);
      expect(done?.supportTier).toBe("B");
      expect((done?.support as { prompt?: string }).prompt).toMatch(/someone you trust/);
      expect(done?.interpretation).toContain("The Fool");
      expect(mockedSave).toHaveBeenCalledWith(
        "u1",
        expect.objectContaining({ supportTier: "B" }),
        true,
        undefined,
        100
      );
    });

    it("guest capture-3: the reading is generated and done carries the tier", async () => {
      mockedGetSession.mockResolvedValue(null);
      const res = await POST(req(body(CAPTURE_3), ip()));
      const { done } = await readRouteSse(res);
      expect(done?.supportTier).toBe("B");
      expect(done?.interpretation).toContain("The Fool");
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    it("an ordinary question carries no tier and no support event", async () => {
      mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
      const res = await POST(req(body("What should I focus on next?"), ip()));
      const { done, events } = await readRouteSse(res);
      expect(events.some((e) => e.event === "support")).toBe(false);
      expect(done?.supportTier).toBeUndefined();
      expect(mockedSave).toHaveBeenCalledWith("u1", expect.not.objectContaining({ supportTier: expect.anything() }), true, undefined, 100);
    });
  });

  describe("S2 health closing by content", () => {
    it("appends HEALTH_CLOSE when the story mentions a diagnosis, with a matching text delta", async () => {
      mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
      const res = await POST(req(body("What should I focus on next?", { story: "I was diagnosed last month and my doctor wants more tests." }), ip()));
      const { done, events } = await readRouteSse(res);
      expect(done?.interpretation).toMatch(new RegExp(`${HEALTH_CLOSE.replace(/\./g, "\\.")}$`));
      const deltas = events.filter((e) => e.event === "text").map((e) => (e.data as { delta: string }).delta);
      expect(deltas.at(-1)).toBe(`\n\n${HEALTH_CLOSE}`);
    });

    it("keeps the category rule: health category gets HEALTH_CLOSE", async () => {
      mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
      const res = await POST(req(body("What should I focus on next?", { category: "health", categoryName: "Health and Wellness" }), ip()));
      expect((await readRouteSse(res)).done?.interpretation).toContain(HEALTH_CLOSE);
    });

    it("non-health control: no health closing", async () => {
      mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
      const res = await POST(req(body("What should I focus on next?"), ip()));
      const { done } = await readRouteSse(res);
      expect(done?.interpretation).not.toContain(HEALTH_CLOSE);
      expect(done?.interpretation).not.toContain(FINANCES_CLOSE);
    });
  });

  describe("S3 finance closing on generate", () => {
    it("appends the exact FINANCES_CLOSE for the finances category, with a matching text delta", async () => {
      mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
      const res = await POST(req(body("What should I focus on next?", { category: "finances", categoryName: "Finances and Money" }), ip()));
      const { done, events } = await readRouteSse(res);
      expect(FINANCES_CLOSE).toBe(
        "This reflection is not financial advice. Please speak with a licensed professional about any financial decision."
      );
      expect((done?.interpretation as string).endsWith(FINANCES_CLOSE)).toBe(true);
      const deltas = events.filter((e) => e.event === "text").map((e) => (e.data as { delta: string }).delta);
      expect(deltas.at(-1)).toBe(`\n\n${FINANCES_CLOSE}`);
      expect(mockedSave).toHaveBeenCalledWith(
        "u1",
        expect.objectContaining({ interpretation: expect.stringContaining(FINANCES_CLOSE) }),
        true,
        undefined,
        100
      );
    });

    it("does not duplicate the finance closing when the model already wrote it", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async () => openRouterStreamResponse(`${READING_TEXT}\n\n${FINANCES_CLOSE}`, "model-a:free"))
      );
      mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
      const res = await POST(req(body("What should I focus on next?", { category: "finances", categoryName: "Finances and Money" }), ip()));
      const { done } = await readRouteSse(res);
      expect((done?.interpretation as string).split(FINANCES_CLOSE).length).toBe(2);
    });
  });
});
