import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimits } from "@/lib/rateLimit";

vi.mock("@/lib/db", () => ({
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
  consumeCheckoutNonce: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  createSession: vi.fn(async () => "test-token"),
  SESSION_COOKIE: "sortes_session",
  SESSION_MAX_AGE: 2592000,
}));
vi.mock("@/lib/lemonsqueezy", () => ({
  lemonConfigured: () => true,
  getOrder: vi.fn(),
  CHECKOUT_NONCE_COOKIE: "sortes_checkout_nonce",
}));

import { POST } from "@/app/api/checkout/claim/route";
import { getUserByEmail, createUser, consumeCheckoutNonce } from "@/lib/db";
import { getOrder } from "@/lib/lemonsqueezy";

const mockedGetUserByEmail = vi.mocked(getUserByEmail);
const mockedCreateUser = vi.mocked(createUser);
const mockedConsume = vi.mocked(consumeCheckoutNonce);
const mockedGetOrder = vi.mocked(getOrder);

function paidOrder(email: string) {
  return {
    data: { attributes: { user_email: email, status: "paid" } },
  };
}

function req(orderId: string, nonce?: string): NextRequest {
  return new NextRequest("http://localhost/api/checkout/claim", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(nonce ? { cookie: `sortes_checkout_nonce=${nonce}` } : {}),
    },
    body: JSON.stringify({ order_id: orderId }),
  });
}

describe("POST /api/checkout/claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
  });

  it("rejects a claim with no checkout nonce (order id alone is not enough)", async () => {
    const res = await POST(req("ord_123"));
    expect(res.status).toBe(403);
    expect(mockedGetOrder).not.toHaveBeenCalled();
  });

  it("rejects an unpaid order without burning the nonce", async () => {
    mockedGetOrder.mockResolvedValue({
      data: { attributes: { user_email: "buyer@example.com", status: "pending" } },
    });
    const res = await POST(req("ord_123", "nonce-abc"));
    expect(res.status).toBe(400);
    expect(mockedConsume).not.toHaveBeenCalled();
  });

  it("rejects a claim whose nonce is already used or for another email", async () => {
    mockedGetOrder.mockResolvedValue(paidOrder("buyer@example.com"));
    mockedConsume.mockResolvedValue(false);
    const res = await POST(req("ord_123", "nonce-abc"));
    expect(res.status).toBe(403);
    expect(mockedConsume).toHaveBeenCalledWith("nonce-abc", "buyer@example.com");
    expect(mockedGetUserByEmail).not.toHaveBeenCalled();
  });

  it("signs in the buyer on a valid single-use nonce, then clears it", async () => {
    mockedGetOrder.mockResolvedValue(paidOrder("buyer@example.com"));
    mockedConsume.mockResolvedValue(true);
    mockedGetUserByEmail.mockResolvedValue(null);
    mockedCreateUser.mockResolvedValue({
      id: "u1",
      email: "buyer@example.com",
      credits: 0,
      created_at: "2026-11-05T00:00:00Z",
    });
    const res = await POST(req("ord_123", "nonce-abc"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(mockedConsume).toHaveBeenCalledWith("nonce-abc", "buyer@example.com");
    expect(res.cookies.get("sortes_session")?.value).toBe("test-token");
    expect(res.cookies.get("sortes_checkout_nonce")?.value).toBe("");
  });
});
