import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  getUserById: vi.fn(),
  spendUserCredits: vi.fn(),
  getReadingForUser: vi.fn(),
  updateReadingForUser: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

import { POST } from "@/app/api/reading/follow-up/route";
import { getSession } from "@/lib/auth";

const mockedGetSession = vi.mocked(getSession);

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
          model: "google/gemini-2.5-flash-preview:free",
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
});
