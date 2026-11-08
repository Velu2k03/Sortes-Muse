import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// Brutal audit F2 (2026-11-08): the callback must accept BOTH link
// shapes (token_hash via verifyOtp, code via exchangeCodeForSession)
// and land every failure on /account with a fixed reason code.

const verifyOtp = vi.fn();
const exchangeCodeForSession = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: vi.fn(async () => ({ auth: { verifyOtp, exchangeCodeForSession } })),
}));
vi.mock("@/lib/db", () => ({
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  createSession: vi.fn(async () => "signed-token"),
  SESSION_COOKIE: "sortes_session",
  SESSION_MAX_AGE: 3600,
  authConfigured: vi.fn(() => true),
}));

import { GET } from "@/app/auth/callback/route";
import { getUserByEmail, createUser } from "@/lib/db";

const mockedGetUserByEmail = vi.mocked(getUserByEmail);
const mockedCreateUser = vi.mocked(createUser);

const USER = { id: "u-1", email: "a@example.com", credits: 3, created_at: "2026-11-08T00:00:00Z", pwd_ver: 1 };

function call(query: string) {
  return GET(new NextRequest(`https://sortes.test/auth/callback?${query}`));
}

describe("GET /auth/callback", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedGetUserByEmail.mockResolvedValue(USER);
    verifyOtp.mockResolvedValue({ data: { user: { email: "A@Example.com" } }, error: null });
    exchangeCodeForSession.mockResolvedValue({ data: { user: { email: "a@example.com" } }, error: null });
  });
  afterEach(() => errorSpy.mockRestore());

  it("token_hash + type=magiclink signs in through verifyOtp", async () => {
    const res = await call("token_hash=th1&type=magiclink");
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "th1", type: "magiclink" });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("https://sortes.test/account?auth=ok");
    expect(res.cookies.get("sortes_session")?.value).toBe("signed-token");
    expect(mockedGetUserByEmail).toHaveBeenCalledWith("a@example.com");
  });

  it("accepts a signup-type link (first link Supabase sends a new address)", async () => {
    const res = await call("token_hash=th2&type=signup");
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "th2", type: "signup" });
    expect(res.headers.get("location")).toContain("auth=ok");
  });

  it("defaults a missing type to email", async () => {
    await call("token_hash=th3");
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "th3", type: "email" });
  });

  it("rejects non-sign-in types such as recovery", async () => {
    const res = await call("token_hash=th4&type=recovery");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("auth=error&reason=invalid");
  });

  it("expired token_hash reports reason=expired", async () => {
    verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: "Token has expired or is invalid", code: "otp_expired" } });
    const res = await call("token_hash=old&type=email");
    expect(res.headers.get("location")).toContain("reason=expired");
  });

  it("code signs in through exchangeCodeForSession with the flow id", async () => {
    const res = await call("code=c1&sb_flow_id=f1");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("c1", { flowId: "f1" });
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("auth=ok");
  });

  it("code opened in another browser reports reason=other-browser", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid flow state, no valid flow state found", code: "flow_state_not_found" },
    });
    const res = await call("code=c2");
    expect(res.headers.get("location")).toContain("reason=other-browser");
  });

  it("Supabase error params (Google exchange failure) report reason=provider", async () => {
    const res = await call("error=server_error&error_description=Unable+to+exchange+external+code");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("reason=provider");
  });

  it("no code and no token_hash reports reason=invalid", async () => {
    const res = await call("");
    expect(res.headers.get("location")).toContain("reason=invalid");
  });

  it("a database failure after a good link reports reason=unavailable", async () => {
    mockedGetUserByEmail.mockRejectedValue(new Error("The request timed out."));
    const res = await call("token_hash=th5&type=email");
    expect(res.headers.get("location")).toContain("reason=unavailable");
  });

  it("creates the Sortes user on first sign-in", async () => {
    mockedGetUserByEmail.mockResolvedValue(undefined as never);
    mockedCreateUser.mockResolvedValue(USER);
    const res = await call("token_hash=th6&type=signup");
    expect(mockedCreateUser).toHaveBeenCalledWith("a@example.com");
    expect(res.headers.get("location")).toContain("auth=ok");
  });
});
