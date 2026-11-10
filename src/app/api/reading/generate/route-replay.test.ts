import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  getUserById: vi.fn(),
  hasUsedFreeReading: vi.fn(),
  saveReadingWithSpend: vi.fn(),
  getReadingForUser: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), guestFreeUsed: vi.fn(), setGuestFreeUsed: vi.fn() }));
vi.mock("@/lib/output-validation", async (orig) => ({
  ...(await orig<typeof import("@/lib/output-validation")>()),
  validateReadingText: () => true,
}));

import { POST } from "@/app/api/reading/generate/route";
import { getReadingForUser, getUserById, hasUsedFreeReading, saveReadingWithSpend } from "@/lib/db";
import { getSession } from "@/lib/auth";

const ID = "6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f";
function req(readingId: unknown, ip: string): NextRequest {
  return new NextRequest("http://localhost/api/reading/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({
      spreadSlug: "celtic-cross",
      readingId,
      cards: [{ cardId: "major-00", reversed: false, position: "Present", name: "The Fool" }],
      intake: { category: "general", categoryName: "General", firstName: "friend", answers: {}, story: "A story.", question: "What next?" },
    }),
  });
}

// Point 1: a retry with the same readingId after a committed save is a replay.
describe("POST /api/reading/generate — idempotent readingId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.mocked(getSession).mockResolvedValue({ userId: "u1", email: "a@b.co" });
    vi.mocked(hasUsedFreeReading).mockResolvedValue(true);
    vi.mocked(getUserById).mockResolvedValue({ id: "u1", email: "a@b.co", credits: 3, created_at: "x" });
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
  });

  it("rejects a non-UUID readingId with 400", async () => {
    const res = await POST(req("not-a-uuid", "10.7.0.1"));
    expect(res.status).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("returns the saved reading with no model call and no spend", async () => {
    const prior = { id: ID, interpretation: "saved text", model: "m:free", free: false };
    vi.mocked(getReadingForUser).mockResolvedValue(prior);
    const res = await POST(req(ID, "10.7.0.2"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reading).toEqual(prior);
    expect(data.interpretation).toBe("saved text");
    expect(data.credits).toBe(3);
    expect(getReadingForUser).toHaveBeenCalledWith("u1", ID);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(saveReadingWithSpend).not.toHaveBeenCalled();
  });

  it("uses the client id as the row id when nothing is saved yet", async () => {
    vi.mocked(getReadingForUser).mockResolvedValue(null);
    vi.mocked(saveReadingWithSpend).mockResolvedValue({ ok: false, free: false });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Body." } }], model: "t/m:free" }),
    }));
    await POST(req(ID, "10.7.0.3"));
    const saved = vi.mocked(saveReadingWithSpend).mock.calls[0];
    expect(saved[1].id).toBe(ID);
  });
});
