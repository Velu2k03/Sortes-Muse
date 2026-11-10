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

// 100+ words so the route's word-count validation accepts it, and it
// names The Fool from the test reading so the Phase E grounding check
// (at least one original card or the clarifier) accepts it too.
const ANSWER = Array.from({ length: 20 }, (_, i) => `sentence number ${i} adds a little more reflection to this follow-up answer, and The Fool keeps the thread open`).join(". ") + ".";

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
          model: "nvidia/nemotron-3-ultra-550b-a55b:free",
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

  // Item 2 regression: guests used to send readingData.followUps in the
  // body; an empty array made every follow-up free (isFree = length 0).
  // Fails on pre-fix main (200 + free:true); guests now get 401 and no
  // model call.
  it.each([
    ["empty followUps array", { ...GUEST_READING, followUps: [] }],
    ["no followUps key", { ...GUEST_READING, followUps: undefined }],
    ["one used follow-up", { ...GUEST_READING, followUps: [{ question: "Q?", answer: "A.", createdAt: "2026-11-05T00:00:00.000Z", free: true }] }],
  ])("refuses a guest follow-up with 401 and no model call (%s)", async (_n, reading) => {
    const res = await POST(
      req({ question: "What does The Fool mean here?", reading }, `10.0.3.${Math.floor(Math.random() * 200) + 10}`)
    );
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.free).toBeUndefined();
    expect(data.answer).toBeUndefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // Phase 5 (5.3): one real clarifier card, drawn server-side from
  // the cards NOT in the spread, saved with the follow-up.
  it("signed-in: first follow-up is free and draws a clarifier outside the spread", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u-1", email: "a@example.com" });
    mockedGetReading.mockResolvedValue({ ...GUEST_READING, followUps: [] });
    mockedGetUserById.mockResolvedValue({ id: "u-1", email: "a@example.com", credits: 5, created_at: "" });
    mockedAppend.mockImplementation(async (_u, _r, fu) => ({ ok: true, followUps: [fu], free: true }));
    const res = await POST(
      req({ question: "What does The Fool mean here?", readingId: "r-1" }, "10.0.3.4")
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.free).toBe(true);
    expect(typeof data.followUps[0].clarifierCardId).toBe("string");
    expect(data.followUps[0].clarifierCardId).not.toBe("major-00");
  });

  it("signed-in: refuses a fourth follow-up with 409", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u-1", email: "a@example.com" });
    mockedGetReading.mockResolvedValue({
      ...GUEST_READING,
      followUps: [1, 2, 3].map((n) => ({
        question: `Q${n}?`,
        answer: `A${n}.`,
        createdAt: "2026-11-05T00:00:00.000Z",
        free: n === 1,
      })),
    });
    const res = await POST(req({ question: "One more?", readingId: "r-1" }, "10.0.3.6"));
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
      1,
      3,
      false,
      undefined
    );
  });

  it("Phase B (F4): when concurrent first follow-up loses the free claim, route returns free: false from appended.free", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u-1", email: "a@example.com" });
    mockedGetReading.mockResolvedValue({
      ...GUEST_READING,
      followUps: [],
    });
    mockedGetUserById.mockResolvedValue({ id: "u-1", email: "a@example.com", credits: 2, created_at: "" });
    mockedAppend.mockResolvedValue({
      ok: true,
      free: false,
      followUps: [
        { question: "First?", answer: "First answer.", free: true },
        { question: "Concurrent?", answer: ANSWER, free: false },
      ],
    });
    const res = await POST(
      req({ question: "Concurrent?", readingId: "r-1" }, "10.0.4.4")
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.free).toBe(false);
    expect(mockedAppend).toHaveBeenCalledWith(
      "u-1",
      "r-1",
      expect.objectContaining({ question: "Concurrent?" }),
      0,
      3,
      true,
      undefined
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

  // Batch 1 (C2): a retry with the same attempt id replays the saved
  // answer with no model call and no spend. Fails on pre-fix main
  // (the route had no followUpId at all, so the retry generated and
  // spent a duplicate).
  it("replays a saved follow-up for the same followUpId, with no model call", async () => {
    const attemptId = "11111111-2222-3333-4444-555555555555";
    mockedGetSession.mockResolvedValue({ userId: "u-1", email: "a@example.com" });
    mockedGetReading.mockResolvedValue({
      ...GUEST_READING,
      followUps: [
        {
          id: attemptId,
          question: "What does The Fool mean here?",
          answer: ANSWER,
          createdAt: "2026-11-05T00:00:00.000Z",
          free: true,
        },
      ],
    });
    mockedGetUserById.mockResolvedValue({ id: "u-1", email: "a@example.com", credits: 5, created_at: "" });
    const res = await POST(
      req({ question: "What does The Fool mean here?", readingId: "r-1", followUpId: attemptId }, "10.0.5.1")
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.replayed).toBe(true);
    expect(data.answer).toBe(ANSWER);
    expect(data.free).toBe(true);
    expect(data.followUps).toHaveLength(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mockedAppend).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID followUpId with 400", async () => {
    const res = await POST(
      req({ question: "What does The Fool mean here?", readingId: "r-1", followUpId: "not-a-uuid" }, "10.0.5.2")
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("followUpId");
  });

  it("passes the followUpId through to the atomic append", async () => {
    const attemptId = "11111111-2222-3333-4444-555555555555";
    mockedGetSession.mockResolvedValue({ userId: "u-1", email: "a@example.com" });
    mockedGetReading.mockResolvedValue({ ...GUEST_READING, followUps: [] });
    mockedGetUserById.mockResolvedValue({ id: "u-1", email: "a@example.com", credits: 5, created_at: "" });
    mockedAppend.mockResolvedValue({
      ok: true,
      followUps: [{ question: "What does The Fool mean here?", answer: ANSWER, free: true, id: attemptId }],
      free: true,
    });
    const res = await POST(
      req({ question: "What does The Fool mean here?", readingId: "r-1", followUpId: attemptId }, "10.0.5.3")
    );
    expect(res.status).toBe(200);
    expect(mockedAppend).toHaveBeenCalledWith(
      "u-1",
      "r-1",
      expect.objectContaining({ question: "What does The Fool mean here?" }),
      0,
      3,
      true,
      attemptId
    );
  });

  // Batch 1 (C2, review fix): the "lost the race inside the
  // transaction" branch serves the saved answer, it does not append.
  it("serves the saved answer when the append reports replayed", async () => {
    const attemptId = "11111111-2222-3333-4444-555555555555";
    mockedGetSession.mockResolvedValue({ userId: "u-1", email: "a@example.com" });
    mockedGetReading.mockResolvedValue({ ...GUEST_READING, followUps: [] });
    mockedGetUserById.mockResolvedValue({ id: "u-1", email: "a@example.com", credits: 5, created_at: "" });
    mockedAppend.mockResolvedValue({
      ok: true,
      replayed: true,
      free: true,
      followUps: [
        { id: attemptId, question: "What does The Fool mean here?", answer: ANSWER, free: true },
      ],
    });
    const res = await POST(
      req({ question: "What does The Fool mean here?", readingId: "r-1", followUpId: attemptId }, "10.0.5.4")
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.replayed).toBe(true);
    expect(data.answer).toBe(ANSWER);
    expect(data.followUps).toHaveLength(1);
  });

  // Batch 1 (C2, review finding 8): the attempt id is bound to the
  // question. The same id with a different question is a 409, not a
  // replay of the old answer.
  it("returns 409 when the same followUpId carries a different question", async () => {
    const attemptId = "11111111-2222-3333-4444-555555555555";
    mockedGetSession.mockResolvedValue({ userId: "u-1", email: "a@example.com" });
    mockedGetReading.mockResolvedValue({
      ...GUEST_READING,
      followUps: [
        {
          id: attemptId,
          question: "What does The Fool mean here?",
          answer: ANSWER,
          createdAt: "2026-11-05T00:00:00.000Z",
          free: true,
        },
      ],
    });
    mockedGetUserById.mockResolvedValue({ id: "u-1", email: "a@example.com", credits: 5, created_at: "" });
    const res = await POST(
      req({ question: "A different question?", readingId: "r-1", followUpId: attemptId }, "10.0.5.5")
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("different question");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mockedAppend).not.toHaveBeenCalled();
  });
});
