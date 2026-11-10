import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  getUserById: vi.fn(),
  hasUsedFreeInterpretation: vi.fn(),
  saveReadingWithSpend: vi.fn(),
  getReadingForUser: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));

import { POST } from "@/app/api/chart/interpret/route";
import { getReadingForUser, getUserById, hasUsedFreeInterpretation, saveReadingWithSpend } from "@/lib/db";
import { getSession } from "@/lib/auth";

const ID = "8b1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f";
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
function req(readingId: unknown, ip: string): NextRequest {
  return new NextRequest("http://localhost/api/chart/interpret", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ system: "western", chart: CHART, category: "general", question: "", readingId }),
  });
}

// Point 1 / 2: chart interpretations replay by id; the id is the client UUID.
describe("POST /api/chart/interpret — idempotent readingId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.mocked(getSession).mockResolvedValue({ userId: "u1", email: "a@b.co" });
    vi.mocked(hasUsedFreeInterpretation).mockResolvedValue(true);
    vi.mocked(getUserById).mockResolvedValue({ id: "u1", email: "a@b.co", credits: 4, created_at: "x" });
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
  });

  it("rejects a non-UUID readingId with 400", async () => {
    // A chart-<system> style string is not an accepted id.
    expect((await POST(req("chart-western", "10.9.0.1"))).status).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("replays a saved interpretation with no model call and no spend", async () => {
    const prior = { id: ID, interpretation: "saved chart text", model: "m:free", free: false };
    vi.mocked(getReadingForUser).mockResolvedValue(prior);
    const res = await POST(req(ID, "10.9.0.2"));
    expect(res.status).toBe(200);
    expect((await res.json()).reading).toEqual(prior);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(saveReadingWithSpend).not.toHaveBeenCalled();
  });
});
