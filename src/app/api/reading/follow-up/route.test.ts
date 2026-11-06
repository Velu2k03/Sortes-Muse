import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  getUserById: vi.fn(),
  getReadingForUser: vi.fn(),
  appendFollowUpWithSpend: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

import { POST } from "@/app/api/reading/follow-up/route";
import { getSession } from "@/lib/auth";
import { getUserById, getReadingForUser, appendFollowUpWithSpend } from "@/lib/db";

const mockedGetSession = vi.mocked(getSession);
const mockedGetUserById = vi.mocked(getUserById);
const mockedGetReading = vi.mocked(getReadingForUser);
const mockedAppend = vi.mocked(appendFollowUpWithSpend);

// 100+ words so the route's word-count validation accepts it.
const ANSWER = Array.from({ length: 20 }, (_, i) => `sentence number ${i} adds a little more reflection to this follow-up answer`).join(". ") + ".";

function req(body: unknown, ip: string): NextRequest {
  return new NextRequest("http://localhost/api/reading/follow-up", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

const GUEST_READING = {
  question: "What should I focus on next?",
  interpretation: "The Fool opens the draw with a beginning that needs no map.",
  cards: [{ cardId: "major-00", position: "Present", name: "The Fool" }],
  category: "general",
  aiGenerated: true,
  followUps: [],
};

describe("POST /api/reading/follow-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
    mockedGetSession.mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: ANSWER } }],
          model: "google/gemma-4-26b-a4b-it:free",
        }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
  });

  it("rejects a follow-up question over 300 characters with 400", async () => {
    const res = await POST(
      req({ question: "x".repeat(301), reading: GUEST_READING }, "10.0.3.1")
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("300");
  });

  it("rejects a guest reading text over 20000 characters with 400", async () => {
    const res = await POST(
      req(
        {
          question: "And then?",
          reading: { ...GUEST_READING, interpretation: "x".repeat(20001) },
        },
        "10.0.3.2"
      )
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("20000");
  });

  it("answers a guest follow-up for free the first time per reading", async () => {
    const res = await POST(
      req({ question: "What does The Fool mean here?", reading: GUEST_READING }, "10.0.3.3")
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.free).toBe(true);
    expect(data.answer).toContain("sentence number");
  });

  // Phase 5 (5.3): one real clarifier card, drawn server-side from
  // the cards NOT in the spread, saved with the follow-up.
  it("draws a clarifier card outside the spread and saves it on the follow-up", async () => {
    const res = await POST(
      req({ question: "What does The Fool mean here?", reading: GUEST_READING }, "10.0.3.4")
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.followUps[0].clarifierCardId).toBe("string");
    expect(data.followUps[0].clarifierCardId).not.toBe("major-00");
  });

  // Cost rules unchanged: first follow-up free, then 1 Oracle each,
  // up to 3 per reading.
  it("charges the second follow-up (not free) and still draws a clarifier", async () => {
    const reading = {
      ...GUEST_READING,
      followUps: [
        { question: "First?", answer: "First answer.", createdAt: "2026-11-05T00:00:00.000Z", free: true },
      ],
    };
    const res = await POST(
      req({ question: "And now?", reading }, "10.0.3.5")
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.free).toBe(false);
    expect(data.followUps).toHaveLength(2);
    expect(data.followUps[1].clarifierCardId).not.toBe("major-00");
  });

  it("refuses a fourth follow-up with 409", async () => {
    const reading = {
      ...GUEST_READING,
      followUps: [1, 2, 3].map((n) => ({
        question: `Q${n}?`,
        answer: `A${n}.`,
        createdAt: "2026-11-05T00:00:00.000Z",
        free: n === 1,
      })),
    };
    const res = await POST(
      req({ question: "One more?", reading }, "10.0.3.6")
    );
    expect(res.status).toBe(409);
  });

  // Phase 6 (N5+N7): signed-in follow-ups check the balance BEFORE
  // the model call and append+spend atomically afterwards.
  it("charges a signed-in second follow-up via the atomic append", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u-1", email: "a@example.com" });
    mockedGetReading.mockResolvedValue({
      ...GUEST_READING,
      followUps: [
        { question: "First?", answer: "First answer.", createdAt: "2026-11-05T00:00:00.000Z", free: true },
      ],
    });
    mockedGetUserById.mockResolvedValue({ id: "u-1", email: "a@example.com", credits: 5, created_at: "" });
    mockedAppend.mockResolvedValue({
      ok: true,
      followUps: [
        { question: "First?", answer: "First answer.", free: true },
        { question: "And now?", answer: ANSWER, free: false },
      ],
    });
    const res = await POST(
      req({ question: "And now?", readingId: "r-1" }, "10.0.4.1")
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.free).toBe(false);
    expect(data.followUps).toHaveLength(2);
    expect(mockedAppend).toHaveBeenCalledWith(
      "u-1",
      "r-1",
      expect.objectContaining({ question: "And now?" }),
      1
    );
  });

  it("returns 402 before generation when a signed-in user has 0 credits", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u-1", email: "a@example.com" });
    mockedGetReading.mockResolvedValue({
      ...GUEST_READING,
      followUps: [
        { question: "First?", answer: "First answer.", createdAt: "2026-11-05T00:00:00.000Z", free: true },
      ],
    });
    mockedGetUserById.mockResolvedValue({ id: "u-1", email: "a@example.com", credits: 0, created_at: "" });
    const res = await POST(
      req({ question: "And now?", readingId: "r-1" }, "10.0.4.2")
    );
    expect(res.status).toBe(402);
    expect(mockedAppend).not.toHaveBeenCalled();
  });

  it("maps a failed atomic append (limit) to 409 after generation", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u-1", email: "a@example.com" });
    mockedGetReading.mockResolvedValue({
      ...GUEST_READING,
      followUps: [
        { question: "First?", answer: "First answer.", createdAt: "2026-11-05T00:00:00.000Z", free: true },
      ],
    });
    mockedGetUserById.mockResolvedValue({ id: "u-1", email: "a@example.com", credits: 5, created_at: "" });
    mockedAppend.mockResolvedValue({ ok: false, reason: "limit" });
    const res = await POST(
      req({ question: "And now?", readingId: "r-1" }, "10.0.4.3")
    );
    expect(res.status).toBe(409);
  });
});
