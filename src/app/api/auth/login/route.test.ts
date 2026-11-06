import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimits } from "@/lib/rateLimit";

vi.mock("@/lib/db", () => ({
  getUserByEmail: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  verifyPassword: vi.fn(),
  createSession: vi.fn(),
  SESSION_COOKIE: "sortes_session",
  SESSION_MAX_AGE: 30 * 24 * 60 * 60,
  authConfigured: () => true,
}));

import { POST } from "@/app/api/auth/login/route";
import { getUserByEmail } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";

const mockedGetUserByEmail = vi.mocked(getUserByEmail);
const mockedVerifyPassword = vi.mocked(verifyPassword);
const mockedCreateSession = vi.mocked(createSession);

function req(email: string, password: string, ip: string): NextRequest {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ email, password }),
  });
}

describe("POST /api/auth/login — rate limits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    mockedGetUserByEmail.mockResolvedValue({
      id: "u1",
      email: "a@b.co",
      credits: 0,
      created_at: "2026-11-05T00:00:00Z",
      password_hash: "salt:hash",
    });
    mockedVerifyPassword.mockResolvedValue(false);
    mockedCreateSession.mockResolvedValue("test-token");
  });

  it("blocks the 11th failed login for one email (per-email limit)", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await POST(req("a@b.co", "wrong", "10.0.0.1"))).status).toBe(401);
    }
    expect((await POST(req("a@b.co", "wrong", "10.0.0.1"))).status).toBe(429);
  });

  it("Phase B (R12): blocks the 31st failed login from one IP across rotating emails", async () => {
    for (let i = 0; i < 30; i++) {
      const res = await POST(req(`victim${i}@example.com`, "wrong", "10.0.0.9"));
      expect(res.status).toBe(401);
    }
    const blocked = await POST(req("victim30@example.com", "wrong", "10.0.0.9"));
    expect(blocked.status).toBe(429);
    // A different IP is unaffected by the first IP's budget.
    expect((await POST(req("victim31@example.com", "wrong", "10.0.0.10"))).status).toBe(401);
  });

  it("a successful login still works and does not consume the failure budgets", async () => {
    mockedVerifyPassword.mockResolvedValue(true);
    const res = await POST(req("a@b.co", "correct-password", "10.0.0.1"));
    expect(res.status).toBe(200);
    expect(res.cookies.get("sortes_session")?.value).toBe("test-token");
    // The success did not record failures: 10 more failures are
    // still possible before the per-email limit bites.
    mockedVerifyPassword.mockResolvedValue(false);
    for (let i = 0; i < 10; i++) {
      expect((await POST(req("a@b.co", "wrong", "10.0.0.1"))).status).toBe(401);
    }
    expect((await POST(req("a@b.co", "wrong", "10.0.0.1"))).status).toBe(429);
  });
});
