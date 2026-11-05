import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimits } from "@/lib/rateLimit";

vi.mock("@/lib/db", () => ({
  getUserById: vi.fn(),
  createCheckoutNonce: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => null),
}));
vi.mock("@/lib/lemonsqueezy", () => ({
  lemonConfigured: () => true,
  createCheckout: vi.fn(async () => "https://lemonsqueezy.test/checkout"),
  CHECKOUT_NONCE_COOKIE: "sortes_checkout_nonce",
  CHECKOUT_NONCE_MAX_AGE: 7200,
}));

import { POST } from "@/app/api/checkout/lemonsqueezy/route";
import { createCheckoutNonce } from "@/lib/db";

const mockedCreateNonce = vi.mocked(createCheckoutNonce);

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/checkout/lemonsqueezy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/checkout/lemonsqueezy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
  });

  it("creates a checkout and binds it to a nonce cookie", async () => {
    mockedCreateNonce.mockResolvedValue("nonce-abc");
    const res = await POST(req({ packId: "pack5", email: "buyer@example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      url: "https://lemonsqueezy.test/checkout",
    });
    expect(mockedCreateNonce).toHaveBeenCalledWith("buyer@example.com", "pack5");
    const cookie = res.cookies.get("sortes_checkout_nonce");
    expect(cookie?.value).toBe("nonce-abc");
    expect(cookie?.httpOnly).toBe(true);
  });

  it("rejects an unknown pack without creating a nonce", async () => {
    const res = await POST(req({ packId: "pack99", email: "buyer@example.com" }));
    expect(res.status).toBe(400);
    expect(mockedCreateNonce).not.toHaveBeenCalled();
  });
});
