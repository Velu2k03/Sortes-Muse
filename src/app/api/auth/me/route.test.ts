import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimits } from "@/lib/rateLimit";

vi.mock("@/lib/db", () => ({
  getUserById: vi.fn(),
  hasUsedFreeReading: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

import { GET } from "@/app/api/auth/me/route";
import { getUserById, hasUsedFreeReading } from "@/lib/db";
import { getSession } from "@/lib/auth";

const mockedGetUserById = vi.mocked(getUserById);
const mockedHasUsedFreeReading = vi.mocked(hasUsedFreeReading);
const mockedGetSession = vi.mocked(getSession);

function req(): NextRequest {
  return new NextRequest("http://localhost/api/auth/me");
}

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedGetUserById.mockResolvedValue({
      id: "u1",
      email: "a@b.co",
      credits: 5,
      created_at: "2026-11-05T00:00:00Z",
    });
    mockedHasUsedFreeReading.mockResolvedValue(false);
  });

  it("returns the signed-in user", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      user: { id: "u1", email: "a@b.co", credits: 5, freeReadingAvailable: true },
    });
  });

  // Batch 1 (C1): the free label follows the server record, not the
  // device flag. An account that already used its free Quick Insight
  // must not be told "Free" by /me.
  it("returns freeReadingAvailable false when the account used its free reading", async () => {
    mockedHasUsedFreeReading.mockResolvedValue(true);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      user: { id: "u1", freeReadingAvailable: false },
    });
  });

  // Batch 1 (C1, review fix): a failing free-flag lookup must not fail
  // /me. The field is omitted and the client fails closed on the label.
  it("omits freeReadingAvailable when the lookup throws, and still returns the user", async () => {
    mockedHasUsedFreeReading.mockRejectedValueOnce(new Error("db down"));
    const res = await GET(req());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.id).toBe("u1");
    expect(data.user.freeReadingAvailable).toBeUndefined();
  });

  it("returns { user: null } without a session", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null });
  });

  // AF-005: the session read had no limit at all; it is called on
  // every page load, so the budget is the generous shared readIp
  // bucket (60/min/IP), matching the other money reads.
  it("returns 429 after 60 reads per minute from one IP", async () => {
    for (let i = 0; i < 60; i++) {
      expect((await GET(req())).status).toBe(200);
    }
    expect((await GET(req())).status).toBe(429);
    expect(mockedGetUserById).toHaveBeenCalledTimes(60);
  });
});
