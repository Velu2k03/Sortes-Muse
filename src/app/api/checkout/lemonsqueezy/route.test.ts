import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimits } from "@/lib/rateLimit";
import { createCheckout } from "@/lib/lemonsqueezy";

vi.mock("@/lib/db", () => ({
  getUserById: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => null),
}));
vi.mock("@/lib/lemonsqueezy", () => ({
  lemonConfigured: () => true,
  createCheckout: vi.fn(async () => "https://lemonsqueezy.test/checkout"),
}));

const mockedCreateCheckout = vi.mocked(createCheckout);

import { POST } from "@/app/api/checkout/lemonsqueezy/route";
import { getSession } from "@/lib/auth";
import { getUserById } from "@/lib/db";

const mockedGetSession = vi.mocked(getSession);
const mockedGetUserById = vi.mocked(getUserById);

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/checkout/lemonsqueezy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/checkout/lemonsqueezy", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedCreateCheckout.mockResolvedValue("https://lemonsqueezy.test/checkout");
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("creates a checkout and returns its URL", async () => {
    const res = await POST(req({ packId: "pack5", email: "buyer@example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      url: "https://lemonsqueezy.test/checkout",
    });
  });

  it("guest checkout uses the supplied body email", async () => {
    mockedGetSession.mockResolvedValue(null);
    const res = await POST(req({ packId: "pack5", email: "guest@example.com" }));
    expect(res.status).toBe(200);
    expect(mockedCreateCheckout).toHaveBeenCalledWith({ packId: "pack5", email: "guest@example.com" });
  });

  it("signed-in checkout ignores body.email and uses the session email", async () => {
    // Phase G follow-up (F1): a signed-in buyer used to be able to
    // supply an arbitrary body.email, which pre-created a
    // passwordless account for that address and forced its owner
    // into the OTP path. The session email is the buyer now.
    mockedGetSession.mockResolvedValue({ userId: "u-1", email: "session@example.com" });
    mockedGetUserById.mockResolvedValue({ id: "u-1", email: "session@example.com", credits: 0, created_at: "2026-11-05T00:00:00Z" });
    const res = await POST(req({ packId: "pack5", email: "someone-else@example.com" }));
    expect(res.status).toBe(200);
    expect(mockedCreateCheckout).toHaveBeenCalledWith({ packId: "pack5", email: "session@example.com", userId: "u-1" });
    expect(mockedCreateCheckout).not.toHaveBeenCalledWith(
      expect.objectContaining({ email: "someone-else@example.com" })
    );
  });

  it("rejects an unknown pack", async () => {
    const res = await POST(req({ packId: "pack99", email: "buyer@example.com" }));
    expect(res.status).toBe(400);
  });

  it("returns 500 and logs structured JSON when createCheckout throws", async () => {
    mockedCreateCheckout.mockRejectedValueOnce(
      new Error("Lemon Squeezy checkout failed (422): invalid variant")
    );
    const res = await POST(req({ packId: "pack5", email: "buyer@example.com" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Could not start checkout. Please try again.",
    });
    const logged = errorSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(
      logged.some(
        (l: string) =>
          l.includes("sortes-lemonsqueezy") &&
          l.includes("checkout-route-error") &&
          l.includes("422")
      )
    ).toBe(true);
  });
});
