import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  getUserById: vi.fn(),
  isSpendBlockedPendingConversion: vi.fn(async () => false),
  getReadingForUser: vi.fn(),
  appendFollowUpWithSpend: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

import { POST } from "@/app/api/reading/follow-up/route";
import { getSession } from "@/lib/auth";
import { getUserById, getReadingForUser, appendFollowUpWithSpend } from "@/lib/db";
import { FINANCES_CLOSE, HEALTH_CLOSE } from "@/lib/safety";

const mockedGetSession = vi.mocked(getSession);
const mockedGetUserById = vi.mocked(getUserById);
const mockedGetReading = vi.mocked(getReadingForUser);
const mockedAppend = vi.mocked(appendFollowUpWithSpend);

const ANSWER = Array.from({ length: 20 }, (_, i) => `sentence number ${i} adds a little more reflection to this follow-up answer, and The Fool keeps the thread open`).join(". ") + ".";

const READING = {
  question: "What should I focus on next?",
  interpretation: "The Fool opens the draw with a beginning that needs no map.",
  cards: [{ cardId: "major-00", position: "Present", name: "The Fool" }],
  category: "General",
  aiGenerated: true,
  followUps: [],
};

const READING_ID = "11111111-1111-4111-8111-111111111111";

function req(body: unknown, ip: string): NextRequest {
  return new NextRequest("http://localhost/api/reading/follow-up", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

let ipN = 0;
const ip = () => `10.8.0.${++ipN}`;

describe("POST /api/reading/follow-up — Batch 1 safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
    mockedGetUserById.mockResolvedValue({ id: "u1", email: "a@b.co", credits: 500, created_at: "2026-11-05T00:00:00Z" });
    mockedAppend.mockImplementation(async (_u, _r, fu) => ({ ok: true, followUps: [fu], free: true }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: ANSWER } }], model: "model-a:free" }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
  });

  it("S1 Tier A (guest): panel instead of the 401, no model call", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await POST(req({ question: "I want to end my life", readingId: READING_ID }, ip()));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.supportOnly).toBe(true);
    expect(data.supportTier).toBe("A");
    expect(data.answer).toBeUndefined();
    expect(data.support.helplineUrl).toBe("https://findahelpline.com");
    expect(data.support.emergencyLine).toContain("call your local emergency number");
    expect(data.support.noCreditsLine).toBe("No credits were spent.");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("S1 Tier A (signed-in): no model call, no append, no spend", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedGetReading.mockResolvedValue({ ...READING });
    const res = await POST(req({ question: "I keep thinking about suicide", readingId: READING_ID }, ip()));
    const data = await res.json();
    expect(data.supportOnly).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mockedAppend).not.toHaveBeenCalled();
  });

  it("S1 Tier B: the answer is generated, the response and the saved follow-up carry the tier", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedGetReading.mockResolvedValue({ ...READING });
    const res = await POST(req({ question: "I feel hopeless, what does The Fool say?", readingId: READING_ID }, ip()));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.answer).toContain("The Fool");
    expect(data.supportTier).toBe("B");
    expect(data.support.prompt).toMatch(/someone you trust/);
    expect(mockedAppend).toHaveBeenCalledWith(
      "u1",
      READING_ID,
      expect.objectContaining({ supportTier: "B" }),
      0,
      3,
      true,
      undefined
    );
  });

  it("S1: the original question joins the check (Tier B original, plain follow-up)", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedGetReading.mockResolvedValue({ ...READING, question: "I feel like giving up. Nothing feels worth it anymore. What should I do?" });
    const data = await (await POST(req({ question: "What does The Fool mean here?", readingId: READING_ID }, ip()))).json();
    expect(data.supportTier).toBe("B");
  });

  it("S2: a health word in the follow-up question appends HEALTH_CLOSE", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedGetReading.mockResolvedValue({ ...READING });
    const data = await (await POST(req({ question: "Should I change my medication?", readingId: READING_ID }, ip()))).json();
    expect(data.answer.endsWith(HEALTH_CLOSE)).toBe(true);
  });

  it("S2 control: a non-health follow-up gets no health closing", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedGetReading.mockResolvedValue({ ...READING });
    const data = await (await POST(req({ question: "What does The Fool mean here?", readingId: READING_ID }, ip()))).json();
    expect(data.answer).not.toContain(HEALTH_CLOSE);
    expect(data.supportTier).toBeUndefined();
  });

  it("category closings match the saved display name (saved rows store 'Finances and Money')", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedGetReading.mockResolvedValue({ ...READING, category: "Finances and Money" });
    const data = await (await POST(req({ question: "What does The Fool mean here?", readingId: READING_ID }, ip()))).json();
    expect(data.answer.endsWith(FINANCES_CLOSE)).toBe(true);
  });

  it("category closings match the saved display name for health ('Health and Wellness')", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedGetReading.mockResolvedValue({ ...READING, category: "Health and Wellness" });
    const data = await (await POST(req({ question: "What does The Fool mean here?", readingId: READING_ID }, ip()))).json();
    expect(data.answer.endsWith(HEALTH_CLOSE)).toBe(true);
  });
});
