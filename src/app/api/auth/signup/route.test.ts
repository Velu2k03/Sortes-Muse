import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimits } from "@/lib/rateLimit";

vi.mock("@/lib/db", () => ({
  getUserByEmail: vi.fn(),
  createUserWithPassword: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  hashPassword: vi.fn(async () => "hashed-pw"),
  createSession: vi.fn(async () => "test-token"),
  isValidEmail: (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e),
  SESSION_COOKIE: "sortes_session",
  SESSION_MAX_AGE: 2592000,
  authConfigured: () => true,
}));

import { POST } from "@/app/api/auth/signup/route";
import { getUserByEmail, createUserWithPassword } from "@/lib/db";

const mockedGetUserByEmail = vi.mocked(getUserByEmail);
const mockedCreate = vi.mocked(createUserWithPassword);

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
  });

  it("creates a new account and signs in", async () => {
    mockedGetUserByEmail.mockResolvedValue(null);
    mockedCreate.mockResolvedValue({
      id: "u1",
      email: "new@example.com",
      credits: 0,
      created_at: "2026-11-05T00:00:00Z",
    });
    const res = await POST(req({ email: "new@example.com", password: "longenough" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(mockedCreate).toHaveBeenCalledWith("new@example.com", "hashed-pw");
    expect(res.cookies.get("sortes_session")?.value).toBe("test-token");
  });

  it("returns 409 for an existing account with a password", async () => {
    mockedGetUserByEmail.mockResolvedValue({
      id: "u1",
      email: "old@example.com",
      credits: 3,
      created_at: "2026-11-05T00:00:00Z",
      password_hash: "salt:hash",
    });
    const res = await POST(req({ email: "old@example.com", password: "longenough" }));
    expect(res.status).toBe(409);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("returns 409 for an existing PASSWORDLESS account (no takeover via signup)", async () => {
    // Passwordless accounts are created by OTP sign-in and the purchase
    // webhook. The old code only 409'd when password_hash was set, so
    // anyone could set a password on such an account and take it over.
    mockedGetUserByEmail.mockResolvedValue({
      id: "u1",
      email: "buyer@example.com",
      credits: 12,
      created_at: "2026-11-05T00:00:00Z",
      password_hash: null,
    });
    const res = await POST(req({ email: "buyer@example.com", password: "longenough" }));
    expect(res.status).toBe(409);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("returns 409 when creation loses a race with another signup", async () => {
    mockedGetUserByEmail.mockResolvedValue(null);
    mockedCreate.mockResolvedValue(null);
    const res = await POST(req({ email: "race@example.com", password: "longenough" }));
    expect(res.status).toBe(409);
  });

  it("rejects a bad email and a short password", async () => {
    expect((await POST(req({ email: "nope", password: "longenough" }))).status).toBe(400);
    expect((await POST(req({ email: "a@b.co", password: "short" }))).status).toBe(400);
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});
