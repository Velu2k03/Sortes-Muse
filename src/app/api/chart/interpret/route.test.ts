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

// A valid chart reflection under the Phase E validator: 300-600
// words, names placements back from the chart lines (Sun in Aries,
// Moon in Cancer, Leo rising), and closes with a question. The stub
// below returns this for every success-path test.
const CHART_TEXT = [
  "This chart reflection begins with your Sun in Aries, a placement that wants a clear direction and a first move it can believe in. The Sun in Aries does not ask for permission. It asks for a horizon, and then it walks toward it with the whole body, not only the plan.",
  "Your Moon in Cancer answers that fire with water. The Moon in Cancer holds the inner weather of the chart, and it asks for shelter before speed. Where Aries wants to decide, Cancer wants to feel whether the decision can be lived in. That is not a contradiction. It is the chart showing you both the engine and the fuel gauge.",
  "Leo rising gives the whole chart its stage. A Leo rising carries the question of how to be seen without performing, and the Sun in Aries agrees with that question more than it argues with it. The tension in these placements is between moving first and waiting until the feeling catches up, and both placements are right in their own season.",
  "What stands out for your focus is the movement from fire through water to a rising sign that wants both. What you may be overlooking is how much of the next step is already in your hands, not in a future decision. One practical step you could take is to write down the smallest next move and do it before the week ends, then notice what that finished step teaches you. The Moon in Cancer keeps the record of what the week actually felt like, and that record is worth reading before the next decision.",
  "This chart reflection closes the way it opened, with the Sun in Aries and the Moon in Cancer in the same room. What would change if you trusted the slower placement first?",
].join(" ");

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
    mockedMarkFree.mockResolvedValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: CHART_TEXT } }],
          model: "nvidia/nemotron-3-ultra-550b-a55b:free",
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

  // Phase B (R7): when the atomic free claim loses the race, the
  // request spends one Oracle instead of serving a second free
  // interpretation, and reports free: false.
  it("spends when the free claim loses the race (mark returns false)", async () => {
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedMarkFree.mockResolvedValue(false);
    const res = await POST(
      req({ system: "western", chart: CHART, category: "general" }, "10.0.2.4")
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.free).toBe(false);
    expect(mockedMarkFree).toHaveBeenCalledWith("u1", "western");
    expect(mockedSpend).toHaveBeenCalledWith("u1", 1);
  });
});
