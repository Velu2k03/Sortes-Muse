import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimits } from "@/lib/rateLimit";

vi.mock("@/lib/db", () => ({
  getUserById: vi.fn(),
  spendUserCredits: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

import { POST } from "@/app/api/credits/balance/route";
import { getUserById, spendUserCredits } from "@/lib/db";
import { getSession } from "@/lib/auth";

const mockedGetUserById = vi.mocked(getUserById);
const mockedSpend = vi.mocked(spendUserCredits);
const mockedGetSession = vi.mocked(getSession);

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/credits/balance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/credits/balance", () => {
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
  });

  it("rejects positive deltas: clients can never mint credits", async () => {
    const res = await POST(req({ delta: 5 }));
    expect(res.status).toBe(400);
    expect(mockedSpend).not.toHaveBeenCalled();
  });

  it("spends on a negative delta", async () => {
    mockedSpend.mockResolvedValue(true);
    mockedGetUserById.mockResolvedValueOnce({
      id: "u1",
      email: "a@b.co",
      credits: 4,
      created_at: "2026-11-05T00:00:00Z",
    });
    const res = await POST(req({ delta: -1 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ credits: 4 });
    expect(mockedSpend).toHaveBeenCalledWith("u1", 1);
  });

  it("returns 402 when the balance cannot cover the spend", async () => {
    mockedSpend.mockResolvedValue(false);
    const res = await POST(req({ delta: -99 }));
    expect(res.status).toBe(402);
  });

  it("requires a session", async () => {
    mockedGetSession.mockResolvedValue(null);
    expect((await POST(req({ delta: -1 }))).status).toBe(401);
  });
});
