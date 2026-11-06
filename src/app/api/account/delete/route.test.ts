import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimits } from "@/lib/rateLimit";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
  SESSION_COOKIE: "sortes_session",
  verifyPassword: vi.fn(),
  hashCode: (code: string) => `hash:${code}`,
  codesMatch: (a: string, b: string) => a === b,
}));
vi.mock("@/lib/db", () => ({
  deleteUser: vi.fn(),
  getUserById: vi.fn(),
  getAuthCode: vi.fn(),
  deleteAuthCode: vi.fn(),
  bumpAuthCodeAttempts: vi.fn(),
}));

import { DELETE } from "@/app/api/account/delete/route";
import { getSession, verifyPassword } from "@/lib/auth";
import {
  deleteUser,
  getUserById,
  getAuthCode,
  deleteAuthCode,
  bumpAuthCodeAttempts,
} from "@/lib/db";

const mockedGetSession = vi.mocked(getSession);
const mockedVerifyPassword = vi.mocked(verifyPassword);
const mockedDeleteUser = vi.mocked(deleteUser);
const mockedGetUserById = vi.mocked(getUserById);
const mockedGetAuthCode = vi.mocked(getAuthCode);
const mockedDeleteAuthCode = vi.mocked(deleteAuthCode);
const mockedBump = vi.mocked(bumpAuthCodeAttempts);

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/account/delete", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const USER = { id: "u1", email: "a@b.co", credits: 0, created_at: "", password_hash: "salt:hash" };

describe("DELETE /api/account/delete (Phase 6 N4 re-auth)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    mockedGetSession.mockResolvedValue({ userId: "u1", email: "a@b.co" });
    mockedGetUserById.mockResolvedValue(USER);
    mockedDeleteUser.mockResolvedValue(true);
    mockedGetAuthCode.mockResolvedValue(null);
  });

  it("requires a session", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await DELETE(req({}));
    expect(res.status).toBe(401);
    expect(mockedDeleteUser).not.toHaveBeenCalled();
  });

  it("refuses without any re-authentication credential", async () => {
    const res = await DELETE(req({}));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toContain("confirm with your password");
    expect(mockedDeleteUser).not.toHaveBeenCalled();
  });

  it("refuses a wrong password and does not delete", async () => {
    mockedVerifyPassword.mockResolvedValue(false);
    const res = await DELETE(req({ password: "nope" }));
    expect(res.status).toBe(401);
    expect(mockedVerifyPassword).toHaveBeenCalledWith("nope", "salt:hash");
    expect(mockedDeleteUser).not.toHaveBeenCalled();
  });

  it("deletes with the correct password and clears the session cookie", async () => {
    mockedVerifyPassword.mockResolvedValue(true);
    const res = await DELETE(req({ password: "correct horse" }));
    expect(res.status).toBe(200);
    expect(mockedDeleteUser).toHaveBeenCalledWith("u1");
    expect(res.cookies.get("sortes_session")?.maxAge).toBe(0);
  });

  it("deletes with a fresh email code and consumes it", async () => {
    mockedGetAuthCode.mockResolvedValue({
      code_hash: "hash:123456",
      expires_at: new Date(Date.now() + 600000).toISOString(),
      attempts: 0,
    });
    const res = await DELETE(req({ code: "123456" }));
    expect(res.status).toBe(200);
    expect(mockedDeleteUser).toHaveBeenCalledWith("u1");
    expect(mockedDeleteAuthCode).toHaveBeenCalledWith("a@b.co");
  });

  it("refuses a wrong code, bumps attempts, and does not delete", async () => {
    mockedGetAuthCode.mockResolvedValue({
      code_hash: "hash:123456",
      expires_at: new Date(Date.now() + 600000).toISOString(),
      attempts: 0,
    });
    const res = await DELETE(req({ code: "000000" }));
    expect(res.status).toBe(401);
    expect(mockedBump).toHaveBeenCalledWith("a@b.co");
    expect(mockedDeleteUser).not.toHaveBeenCalled();
  });

  it("tells a passwordless account to use a code instead", async () => {
    mockedGetUserById.mockResolvedValue({ ...USER, password_hash: null });
    const res = await DELETE(req({ password: "anything" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toContain("no password set");
    expect(mockedDeleteUser).not.toHaveBeenCalled();
  });
});
