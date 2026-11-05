import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "crypto";

vi.mock("@/lib/db", () => ({
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
  fulfillOrder: vi.fn(),
  revokeOrder: vi.fn(),
}));

import { POST } from "@/app/api/webhooks/lemonsqueezy/route";
import { getUserByEmail, createUser, fulfillOrder, revokeOrder } from "@/lib/db";

const mockedGetUserByEmail = vi.mocked(getUserByEmail);
const mockedCreateUser = vi.mocked(createUser);
const mockedFulfill = vi.mocked(fulfillOrder);
const mockedRevoke = vi.mocked(revokeOrder);

const SECRET = "test-webhook-secret";

function signedReq(payload: unknown): NextRequest {
  const raw = JSON.stringify(payload);
  const sig = createHmac("sha256", SECRET).update(raw).digest("hex");
  return new NextRequest("http://localhost/api/webhooks/lemonsqueezy", {
    method: "POST",
    headers: { "x-signature": sig, "Content-Type": "application/json" },
    body: raw,
  });
}

function orderCreated(overrides: Record<string, unknown> = {}) {
  return {
    meta: { event_name: "order_created" },
    data: {
      id: "ord_1",
      attributes: {
        user_email: "buyer@example.com",
        status: "paid",
        store_id: 42,
        currency: "USD",
        total: 399,
        subtotal: 399,
        first_order_item: { variant_id: 111 },
        ...overrides,
      },
    },
  };
}

describe("POST /api/webhooks/lemonsqueezy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LEMONSQUEEZY_WEBHOOK_SECRET = SECRET;
    process.env.LEMONSQUEEZY_STORE_ID = "42";
    process.env.LEMONSQUEEZY_VARIANT_PACK5 = "111";
    process.env.LEMONSQUEEZY_VARIANT_PACK12 = "222";
    process.env.LEMONSQUEEZY_VARIANT_PACK30 = "333";
  });

  it("rejects a bad signature", async () => {
    const req = new NextRequest("http://localhost/api/webhooks/lemonsqueezy", {
      method: "POST",
      headers: { "x-signature": "nope" },
      body: JSON.stringify(orderCreated()),
    });
    expect((await POST(req)).status).toBe(401);
    expect(mockedFulfill).not.toHaveBeenCalled();
  });

  it("rejects a wrong store id", async () => {
    const res = await POST(signedReq(orderCreated({ store_id: 99 })));
    expect(res.status).toBe(400);
    expect(mockedFulfill).not.toHaveBeenCalled();
  });

  it("rejects a non-USD currency", async () => {
    const res = await POST(signedReq(orderCreated({ currency: "EUR" })));
    expect(res.status).toBe(400);
    expect(mockedFulfill).not.toHaveBeenCalled();
  });

  it("rejects an amount that does not match the pack price", async () => {
    const res = await POST(signedReq(orderCreated({ total: 1, subtotal: 1 })));
    expect(res.status).toBe(400);
    expect(mockedFulfill).not.toHaveBeenCalled();
  });

  it("fulfills a valid paid order atomically", async () => {
    mockedGetUserByEmail.mockResolvedValue(null);
    mockedCreateUser.mockResolvedValue({
      id: "u1",
      email: "buyer@example.com",
      credits: 0,
      created_at: "2026-11-05T00:00:00Z",
    });
    mockedFulfill.mockResolvedValue({ transaction: null, credits: 5, duplicate: false });
    const res = await POST(signedReq(orderCreated()));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(mockedFulfill).toHaveBeenCalledWith({
      userId: "u1",
      email: "buyer@example.com",
      packType: "pack5 (lemonsqueezy:ord_1)",
      amount: 3.99,
      readings: 5,
      orderId: "ord_1",
    });
  });

  it("reports a duplicate delivery without granting twice", async () => {
    mockedGetUserByEmail.mockResolvedValue({
      id: "u1",
      email: "buyer@example.com",
      credits: 5,
      created_at: "2026-11-05T00:00:00Z",
    });
    mockedFulfill.mockResolvedValue({ transaction: null, credits: 5, duplicate: true });
    const res = await POST(signedReq(orderCreated()));
    expect(await res.json()).toMatchObject({ ok: true, duplicate: true });
  });

  it("ignores unpaid orders", async () => {
    const res = await POST(signedReq(orderCreated({ status: "pending" })));
    expect(await res.json()).toMatchObject({ ok: true, ignored: "not paid" });
    expect(mockedFulfill).not.toHaveBeenCalled();
  });

  it("revokes credits on order_refunded", async () => {
    mockedRevoke.mockResolvedValue({ revoked: true, readings: 5 });
    const res = await POST(
      signedReq({ meta: { event_name: "order_refunded" }, data: { id: "ord_1", attributes: {} } })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, refunded: true });
    expect(mockedRevoke).toHaveBeenCalledWith("ord_1");
    expect(mockedFulfill).not.toHaveBeenCalled();
  });

  it("does not fail a refund with nothing to revoke", async () => {
    mockedRevoke.mockResolvedValue({ revoked: false, readings: 0 });
    const res = await POST(
      signedReq({ meta: { event_name: "order_refunded" }, data: { id: "ord_9", attributes: {} } })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, refunded: false });
  });
});
