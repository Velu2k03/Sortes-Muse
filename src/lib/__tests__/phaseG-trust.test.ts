import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimits } from "@/lib/rateLimit";

// Phase G trust tests: three properties the money and privacy story
// rests on, proven at the route level with the database mocked.
// 1. No self-grant: no route grants credits without a verified order.
//    The balance endpoint is GET-only, client-supplied user ids are
//    ignored, and pack prices are server-chosen, never client-chosen.
// 2. No cross-account access: one user cannot read or mutate another
//    user's readings, journal entries, or reports via the API.
// 3. No charge for failed results: a failed AI generation spends
//    nothing on any of the paid routes.

vi.mock("@/lib/db", () => ({
  getUserById: vi.fn(),
  spendUserCredits: vi.fn(),
  hasUsedFreeReading: vi.fn(),
  markFreeReadingUsed: vi.fn(),
  getReadingForUser: vi.fn(),
  appendFollowUpWithSpend: vi.fn(),
  hasUsedFreeInterpretation: vi.fn(),
  markFreeInterpretationUsed: vi.fn(),
  saveReadingForUser: vi.fn(),
  updateReadingForUser: vi.fn(),
  listReadingsForUser: vi.fn(),
  deleteReadingForUser: vi.fn(),
  getReportForUser: vi.fn(),
  deleteReportForUser: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

import { GET as balanceGET } from "@/app/api/credits/balance/route";
import * as balanceRoute from "@/app/api/credits/balance/route";
import { POST as followUpPOST } from "@/app/api/reading/follow-up/route";
import { POST as generatePOST } from "@/app/api/reading/generate/route";
import { POST as interpretPOST } from "@/app/api/chart/interpret/route";
import { POST as reportsGeneratePOST } from "@/app/api/reports/generate/route";
import { POST as historyPOST, DELETE as historyDELETE } from "@/app/api/history/route";
import { GET as reportGET } from "@/app/api/reports/[id]/route";
import {
  getUserById,
  spendUserCredits,
  hasUsedFreeReading,
  getReadingForUser,
  appendFollowUpWithSpend,
  hasUsedFreeInterpretation,
  saveReadingForUser,
  deleteReadingForUser,
  getReportForUser,
} from "@/lib/db";
import { getSession } from "@/lib/auth";

const mockedGetUserById = vi.mocked(getUserById);
const mockedSpend = vi.mocked(spendUserCredits);
const mockedHasUsedFree = vi.mocked(hasUsedFreeReading);
const mockedGetReading = vi.mocked(getReadingForUser);
const mockedAppend = vi.mocked(appendFollowUpWithSpend);
const mockedHasUsedFreeInterp = vi.mocked(hasUsedFreeInterpretation);
const mockedSaveReading = vi.mocked(saveReadingForUser);
const mockedDeleteReading = vi.mocked(deleteReadingForUser);
const mockedGetReport = vi.mocked(getReportForUser);
const mockedGetSession = vi.mocked(getSession);

function req(url: string, body: unknown, ip: string): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
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

// Valid birth input for the reports route (same fixture as the
// reports/generate input-validation tests).
const REPORT_BIRTH = {
  date: "1990-05-01",
  hour: 12,
  minute: 0,
  latitude: 14.6,
  longitude: 121,
  gender: "female",
};

function generateBody(spreadSlug: string) {
  return {
    spreadSlug,
    claimFree: false,
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

describe("trust: no self-grant of credits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    mockedGetSession.mockResolvedValue(null);
    mockedGetUserById.mockResolvedValue({ id: "u-1", email: "a@example.com", credits: 5, created_at: "" });
    mockedSpend.mockResolvedValue(true);
    mockedHasUsedFree.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
  });

  it("the balance endpoint has no POST handler at all (GET only)", () => {
    expect(balanceRoute.GET).toBeTypeOf("function");
    expect((balanceRoute as unknown as Record<string, unknown>).POST).toBeUndefined();
  });

  it("balance GET still requires a session (401 without one)", async () => {
    const res = await balanceGET();
    expect(res.status).toBe(401);
  });

  it("history sync ignores a client-supplied user id and saves under the session user", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u-1", email: "a@example.com" });
    mockedSaveReading.mockResolvedValue(undefined);
    const res = await historyPOST(
      req("http://localhost/api/history", { readings: [{ id: "r-1", user_id: "victim-user", question: "x" }] }, "10.1.0.1")
    );
    expect(res.status).toBe(200);
    expect(mockedSaveReading).toHaveBeenCalledWith("u-1", expect.objectContaining({ id: "r-1" }));
    expect(mockedSaveReading).not.toHaveBeenCalledWith("victim-user", expect.anything());
  });
});

describe("trust: no cross-account access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    mockedGetSession.mockResolvedValue({ userId: "u-1", email: "a@example.com" });
    mockedGetUserById.mockResolvedValue({ id: "u-1", email: "a@example.com", credits: 5, created_at: "" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
  });

  it("a follow-up for another user's reading id returns 404 and appends nothing", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    mockedGetReading.mockResolvedValue(null);
    const res = await followUpPOST(
      req("http://localhost/api/reading/follow-up", { question: "And then?", readingId: "victim-reading" }, "10.1.0.2")
    );
    expect(res.status).toBe(404);
    expect(mockedAppend).not.toHaveBeenCalled();
  });

  it("reading another user's report id returns 404", async () => {
    mockedGetReport.mockResolvedValue(null);
    const res = await reportGET(
      new NextRequest("http://localhost/api/reports/victim-report", { headers: { "x-forwarded-for": "10.1.0.3" } }),
      { params: Promise.resolve({ id: "victim-report" }) }
    );
    expect(res.status).toBe(404);
    expect(mockedGetReport).toHaveBeenCalledWith("u-1", "victim-report");
  });

  it("deleting another user's journal entry returns 404 and deletes nothing", async () => {
    mockedDeleteReading.mockResolvedValue(false);
    const res = await historyDELETE(
      req("http://localhost/api/history", { id: "victim-reading" }, "10.1.0.4")
    );
    expect(res.status).toBe(404);
    expect(mockedDeleteReading).toHaveBeenCalledWith("u-1", "victim-reading");
  });
});

describe("trust: no charge for failed results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    process.env.OPENROUTER_API_KEY = "test-key";
    mockedGetSession.mockResolvedValue({ userId: "u-1", email: "a@example.com" });
    mockedGetUserById.mockResolvedValue({ id: "u-1", email: "a@example.com", credits: 5, created_at: "" });
    mockedSpend.mockResolvedValue(true);
    mockedHasUsedFree.mockResolvedValue(false);
    mockedHasUsedFreeInterp.mockResolvedValue(true);
    // Every model fails: OpenRouter 500 on every attempt, both passes.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => ({ error: { message: "upstream boom" } }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
  });

  it("a failed tarot generation returns 503 and spends nothing", async () => {
    const res = await generatePOST(req("http://localhost/api/reading/generate", generateBody("past-present-future"), "10.1.0.5"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("No Oracle was spent");
    expect(mockedSpend).not.toHaveBeenCalled();
  }, 30_000);

  it("a failed follow-up returns 503 and appends/spends nothing", async () => {
    mockedGetReading.mockResolvedValue({ ...GUEST_READING, followUps: [{ question: "First?", answer: "First answer.", createdAt: "2026-11-05T00:00:00.000Z", free: true }] });
    const res = await followUpPOST(req("http://localhost/api/reading/follow-up", { question: "And now?", readingId: "r-1" }, "10.1.0.6"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("No Oracle was spent");
    expect(mockedAppend).not.toHaveBeenCalled();
  }, 30_000);

  it("a failed chart interpretation returns 503 and spends nothing", async () => {
    const res = await interpretPOST(req("http://localhost/api/chart/interpret", { system: "western", chart: CHART, question: "What stands out?" }, "10.1.0.7"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("No Oracle was spent");
    expect(mockedSpend).not.toHaveBeenCalled();
  }, 30_000);

  it("a failed report generation returns 503 and spends nothing", async () => {
    const res = await reportsGeneratePOST(req("http://localhost/api/reports/generate", { type: "transit", birth: REPORT_BIRTH, targetDate: "2026-11-07" }, "10.1.0.8"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("No Oracle was spent");
    expect(mockedSpend).not.toHaveBeenCalled();
  }, 30_000);
});
