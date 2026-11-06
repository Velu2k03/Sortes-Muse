import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getUserById: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

// Phase B (R15): the POST handler was deleted. This file now covers
// the GET-only balance route and asserts POST is gone.
import * as routeModule from "@/app/api/credits/balance/route";
import { getUserById } from "@/lib/db";
import { getSession } from "@/lib/auth";

const mockedGetUserById = vi.mocked(getUserById);
const mockedGetSession = vi.mocked(getSession);

describe("GET /api/credits/balance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedGetUserById.mockResolvedValue({
      id: "u1",
      email: "a@b.co",
      credits: 5,
      created_at: "2026-11-05T00:00:00Z",
    });
  });

  it("returns the caller's balance", async () => {
    const res = await routeModule.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ credits: 5 });
    expect(mockedGetUserById).toHaveBeenCalledWith("u1");
  });

  it("requires a session", async () => {
    mockedGetSession.mockResolvedValue(null);
    expect((await routeModule.GET()).status).toBe(401);
  });

  it("returns 401 when the session user no longer exists", async () => {
    mockedGetUserById.mockResolvedValue(null);
    expect((await routeModule.GET()).status).toBe(401);
  });

  it("has no POST handler: clients cannot spend via this route", () => {
    expect((routeModule as { POST?: unknown }).POST).toBeUndefined();
  });
});
