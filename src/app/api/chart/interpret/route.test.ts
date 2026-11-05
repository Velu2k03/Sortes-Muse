import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  getUserById: vi.fn(),
  spendUserCredits: vi.fn(),
  hasUsedFreeInterpretation: vi.fn(),
  markFreeInterpretationUsed: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

import { POST } from "@/app/api/chart/interpret/route";
import {
  getUserById,
  spendUserCredits,
  hasUsedFreeInterpretation,
  markFreeInterpretationUsed,
} from "@/lib/db";
import { getSession } from "@/lib/auth";

const mockedGetUserById = vi.mocked(getUserById);
const mockedSpend = vi.mocked(spendUserCredits);
const mockedHasUsedFree = vi.mocked(hasUsedFreeInterpretation);
const mockedMarkFree = vi.mocked(markFreeInterpretationUsed);
const mockedGetSession = vi.mocked(getSession);

const CHART = {
  system: "western",
  sunSign: "Aries",
  ascendantSign: "Leo",
  midheavenSign: "Taurus",
  planets: [
    { name: "Sun", sign: "Aries", longitude: 10, house: 1, retrograde: false },
    { name: "Moon", sign: "Cancer", longitude: 100, house: 4, retrograde: false },
  ],
  cusps: [],
  aspects: [],
};

function req(body: unknown, ip: string): NextRequest {
  return new NextRequest("http://localhost/api/chart/interpret", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chart/interpret", () => {
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "A warm chart reflection, written for this test." } }],
          model: "google/gemini-2.5-flash-preview:free",
        }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
  });

  it("rejects a question over 300 characters with 400 instead of truncating it", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await POST(
      req({ system: "western", chart: CHART, question: "x".repeat(301) }, "10.0.2.1")
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("300");
  });

  it("accepts a question at exactly 300 characters", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await POST(
      req({ system: "western", chart: CHART, question: "x".repeat(300) }, "10.0.2.2")
    );
    expect(res.status).toBe(200);
  });

  it("serves a signed-in first interpretation free and marks it", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    const res = await POST(
      req({ system: "western", chart: CHART, category: "general" }, "10.0.2.3")
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.free).toBe(true);
    expect(data.interpretation).toContain("chart reflection");
    expect(mockedSpend).not.toHaveBeenCalled();
    expect(mockedMarkFree).toHaveBeenCalledWith("u1", "western");
  });
});
