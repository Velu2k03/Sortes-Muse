import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimits } from "@/lib/rateLimit";
import { hashCode } from "@/lib/auth";

// Phase 6 integration test prep: the full Resend-path OTP flow
// (request code -> verify code -> session) against the local stack.
// Only the DB layer is mocked (the real JSON store would write to
// data/local-db.json); the code generation, hashing, comparison,
// expiry, attempt counting, and session signing are all real.
vi.mock("@/lib/db", () => ({
  storeAuthCode: vi.fn(),
  getAuthCode: vi.fn(),
  deleteAuthCode: vi.fn(),
  bumpAuthCodeAttempts: vi.fn(),
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
}));

import { POST as requestCode } from "@/app/api/auth/request-code/route";
import { POST as verifyCode } from "@/app/api/auth/verify-code/route";
import {
  storeAuthCode,
  getAuthCode,
  deleteAuthCode,
  bumpAuthCodeAttempts,
  getUserByEmail,
  createUser,
} from "@/lib/db";

const mockedStore = vi.mocked(storeAuthCode);
const mockedGet = vi.mocked(getAuthCode);
const mockedDelete = vi.mocked(deleteAuthCode);
const mockedBump = vi.mocked(bumpAuthCodeAttempts);
const mockedGetUser = vi.mocked(getUserByEmail);
const mockedCreateUser = vi.mocked(createUser);

function req(url: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.11" },
    body: JSON.stringify(body),
  });
}

describe("OTP flow (local stack, Resend path)", () => {
  // In-memory stand-in for the auth_codes table.
  let stored: { code_hash: string; expires_at: string; attempts: number } | null;

  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    stored = null;
    mockedStore.mockImplementation(async (_email: string, hash: string, exp: Date) => {
      stored = { code_hash: hash, expires_at: exp.toISOString(), attempts: 0 };
    });
    mockedGet.mockImplementation(async () => stored);
    mockedDelete.mockImplementation(async () => {
      stored = null;
    });
    mockedBump.mockImplementation(async () => {
      if (stored) stored.attempts += 1;
    });
    mockedGetUser.mockResolvedValue(null);
    mockedCreateUser.mockResolvedValue({
      id: "u-otp",
      email: "otp@test.co",
      credits: 0,
      created_at: "2026-11-05T00:00:00Z",
    });
    // Phase B (R11): the dev-code path needs the explicit local-only
    // flag; without it request-code cannot return a code at all.
    process.env.SORTES_LOCAL_DEV_CODE = "1";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SORTES_LOCAL_DEV_CODE;
  });

  it("request-code returns a 6-digit dev code in local dev, verify-code signs the user in", async () => {
    const r1 = await requestCode(req("/api/auth/request-code", { email: "otp@test.co" }));
    expect(r1.status).toBe(200);
    const d1 = await r1.json();
    expect(d1.ok).toBe(true);
    // Dev only, with SORTES_LOCAL_DEV_CODE=1: no email provider
    // configured, so the code comes back in the response. Never
    // present in production with Resend configured, and never
    // present without the explicit flag.
    expect(d1.devCode).toMatch(/^\d{6}$/);
    expect(mockedStore).toHaveBeenCalledTimes(1);
    expect(mockedStore.mock.calls[0][1]).toBe(hashCode(d1.devCode));

    const r2 = await verifyCode(req("/api/auth/verify-code", { email: "otp@test.co", code: d1.devCode }));
    expect(r2.status).toBe(200);
    const d2 = await r2.json();
    expect(d2.ok).toBe(true);
    expect(d2.user.email).toBe("otp@test.co");
    const cookie = r2.cookies.get("sortes_session");
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.httpOnly).toBe(true);
    // Single-use: the code is gone after a successful verify.
    expect(mockedDelete).toHaveBeenCalledWith("otp@test.co");
  });

  it("without the local-dev flag, no dev code is returned (fail closed)", async () => {
    delete process.env.SORTES_LOCAL_DEV_CODE;
    const r1 = await requestCode(req("/api/auth/request-code", { email: "otp@test.co" }));
    expect(r1.status).toBe(500);
    const d1 = await r1.json();
    expect(d1.devCode).toBeUndefined();
  });

  it("the code value is never written to the log", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const r1 = await requestCode(req("/api/auth/request-code", { email: "otp@test.co" }));
    const { devCode } = await r1.json();
    expect(devCode).toMatch(/^\d{6}$/);
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).not.toContain(devCode);
    expect(logged).toContain("sign-in code issued");
    logSpy.mockRestore();
  });

  it("a wrong code is rejected and counts an attempt", async () => {
    const r1 = await requestCode(req("/api/auth/request-code", { email: "otp@test.co" }));
    const { devCode } = await r1.json();
    const wrong = devCode === "000000" ? "000001" : "000000";
    const r2 = await verifyCode(req("/api/auth/verify-code", { email: "otp@test.co", code: wrong }));
    expect(r2.status).toBe(400);
    expect((await r2.json()).error).toContain("not correct");
    expect(mockedBump).toHaveBeenCalledWith("otp@test.co");
    expect(mockedCreateUser).not.toHaveBeenCalled();
  });

  it("an expired code is rejected and deleted", async () => {
    await requestCode(req("/api/auth/request-code", { email: "otp@test.co" }));
    if (stored) stored.expires_at = new Date(Date.now() - 1000).toISOString();
    const r2 = await verifyCode(req("/api/auth/verify-code", { email: "otp@test.co", code: "123456" }));
    expect(r2.status).toBe(400);
    expect((await r2.json()).error).toContain("expired");
    expect(mockedDelete).toHaveBeenCalledWith("otp@test.co");
  });

  it("5 attempts locks the code out", async () => {
    await requestCode(req("/api/auth/request-code", { email: "otp@test.co" }));
    if (stored) stored.attempts = 5;
    const r2 = await verifyCode(req("/api/auth/verify-code", { email: "otp@test.co", code: "123456" }));
    expect(r2.status).toBe(429);
    expect(mockedDelete).toHaveBeenCalledWith("otp@test.co");
    expect(mockedCreateUser).not.toHaveBeenCalled();
  });

  it("a non-6-digit code is rejected before any DB lookup", async () => {
    const r = await verifyCode(req("/api/auth/verify-code", { email: "otp@test.co", code: "12345" }));
    expect(r.status).toBe(400);
    expect(mockedGet).not.toHaveBeenCalled();
  });
});
